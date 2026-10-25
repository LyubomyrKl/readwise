"""Entity extraction and tracking across document processing."""

import json
import logging
import re
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Set

from worker.tools.reader.summarize.core.models import Entity
from worker.tools.reader.summarize.core.protocols import EntityTrackerProtocol, LLMClientProtocol
from worker.tools.reader.summarize.core.exceptions import EntityExtractionError
from worker.tools.reader.summarize.config.settings import SummarizationSettings

logger = logging.getLogger(__name__)

ENTITY_EXTRACTION_PROMPT = """Extract key entities from the following text. Focus on:
- People (names, titles, roles)
- Places (locations, organizations)
- Concepts (key ideas, theories, technical terms)
- Things (products, artifacts, important objects)

For each entity, provide:
1. name: The canonical name
2. type: One of [person, place, organization, concept, term, thing]
3. context: A brief description (1-2 sentences max)

Return as JSON array:
[
  {"name": "Entity Name", "type": "type", "context": "Brief description"},
  ...
]

Text:
{text}

IMPORTANT: Write entity names and context descriptions in the same language as the source text.
Return ONLY the JSON array, no other text."""


class EntityTracker(EntityTrackerProtocol):
    """Track and maintain entity consistency across a document.

    This class extracts entities from text using an LLM and maintains
    a registry of entities with alias resolution and deduplication.
    """

    def __init__(
        self,
        llm_client: LLMClientProtocol,
        similarity_threshold: float = 0.85,
        max_entities: int = 100,
    ):
        """Initialize the entity tracker.

        Args:
            llm_client: LLM client for entity extraction
            similarity_threshold: Threshold for entity similarity matching (0-1)
            max_entities: Maximum entities to track
        """
        self._llm_client = llm_client
        self.similarity_threshold = similarity_threshold
        self.max_entities = max_entities
        self._entities: Dict[str, Entity] = {}
        self._alias_map: Dict[str, str] = {}  # alias -> canonical name

    @classmethod
    def from_settings(
        cls, llm_client: LLMClientProtocol, settings: SummarizationSettings
    ) -> "EntityTracker":
        """Create tracker from settings."""
        return cls(
            llm_client=llm_client,
            similarity_threshold=settings.entity_similarity_threshold,
            max_entities=settings.entity_max_tracked,
        )

    def _normalize_name(self, name: str) -> str:
        """Normalize an entity name for comparison."""
        return re.sub(r'\s+', ' ', name.lower().strip())

    def _calculate_similarity(self, name1: str, name2: str) -> float:
        """Calculate similarity between two entity names.

        Uses a combination of:
        - SequenceMatcher ratio for string similarity
        - Substring matching for abbreviated forms

        Args:
            name1: First name
            name2: Second name

        Returns:
            Similarity score (0-1)
        """
        n1 = self._normalize_name(name1)
        n2 = self._normalize_name(name2)

        # Exact match
        if n1 == n2:
            return 1.0

        # Substring match (e.g., "John" in "John Smith")
        if n1 in n2 or n2 in n1:
            shorter = min(len(n1), len(n2))
            longer = max(len(n1), len(n2))
            return shorter / longer * 0.9

        # Sequence matcher similarity
        return SequenceMatcher(None, n1, n2).ratio()

    def _find_similar_entity(self, name: str) -> Optional[str]:
        """Find an existing entity similar to the given name.

        Args:
            name: Name to search for

        Returns:
            Canonical name of similar entity, or None
        """
        normalized = self._normalize_name(name)

        # Check alias map first
        if normalized in self._alias_map:
            return self._alias_map[normalized]

        # Check against all entities
        best_match = None
        best_score = 0.0

        for canonical_name in self._entities:
            score = self._calculate_similarity(name, canonical_name)
            if score > best_score and score >= self.similarity_threshold:
                best_score = score
                best_match = canonical_name

            # Also check aliases
            entity = self._entities[canonical_name]
            for alias in entity.aliases:
                score = self._calculate_similarity(name, alias)
                if score > best_score and score >= self.similarity_threshold:
                    best_score = score
                    best_match = canonical_name

        return best_match

    async def extract_entities(self, text: str) -> List[Entity]:
        """Extract entities from text using LLM.

        Args:
            text: Text to extract entities from

        Returns:
            List of extracted entities

        Raises:
            EntityExtractionError: If extraction fails
        """
        if not text or len(text.strip()) < 50:
            return []

        try:
            prompt = ENTITY_EXTRACTION_PROMPT.format(text=text[:3000])  # Limit text length

            response = await self._llm_client.complete(
                prompt=prompt,
                system_prompt="You are an expert at named entity recognition. Extract only the most important entities.",
                max_tokens=800,
                temperature=0.1,
            )

            # Parse JSON response
            entities = self._parse_entity_response(response)
            return entities

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse entity extraction response: {e}")
            return []
        except Exception as e:
            logger.error(f"Entity extraction failed: {e}")
            raise EntityExtractionError(f"Failed to extract entities: {e}") from e

    def _parse_entity_response(self, response: str) -> List[Entity]:
        """Parse LLM response into Entity objects.

        Args:
            response: LLM response string

        Returns:
            List of Entity objects
        """
        # Try to extract JSON from response
        response = response.strip()

        # Handle markdown code blocks
        if response.startswith("```"):
            lines = response.split('\n')
            # Remove first and last lines (code block markers)
            json_lines = [l for l in lines if not l.startswith("```")]
            response = '\n'.join(json_lines)

        # Find JSON array in response
        start_idx = response.find('[')
        end_idx = response.rfind(']')

        if start_idx == -1 or end_idx == -1:
            logger.warning("No JSON array found in entity extraction response")
            return []

        json_str = response[start_idx:end_idx + 1]
        data = json.loads(json_str)

        entities = []
        for item in data:
            if not isinstance(item, dict):
                continue

            name = item.get("name", "").strip()
            if not name:
                continue

            entity = Entity(
                name=name,
                type=item.get("type", "unknown").lower(),
                context=item.get("context", ""),
                aliases=[],
                mention_count=1,
            )
            entities.append(entity)

        return entities

    def register_entity(self, entity: Entity) -> Entity:
        """Register an entity, merging with existing if similar.

        Args:
            entity: Entity to register

        Returns:
            The registered entity (may be merged with existing)
        """
        # Check if we've hit the limit
        if len(self._entities) >= self.max_entities:
            # Only add if it's more important than least important existing
            least_important = min(
                self._entities.values(),
                key=lambda e: (e.mention_count, e.importance_score)
            )
            if entity.mention_count <= least_important.mention_count:
                return entity  # Don't add

            # Remove least important to make room
            del self._entities[least_important.name]

        # Check for similar existing entity
        similar_name = self._find_similar_entity(entity.name)

        if similar_name:
            # Merge with existing
            existing = self._entities[similar_name]
            existing.merge_with(entity)

            # Add name as alias
            self._alias_map[self._normalize_name(entity.name)] = similar_name

            return existing
        else:
            # Add as new entity
            self._entities[entity.name] = entity
            self._alias_map[self._normalize_name(entity.name)] = entity.name
            return entity

    def register_entities(self, entities: List[Entity]) -> List[Entity]:
        """Register multiple entities.

        Args:
            entities: Entities to register

        Returns:
            List of registered entities (may be merged)
        """
        return [self.register_entity(e) for e in entities]

    def resolve_reference(self, reference: str) -> Optional[Entity]:
        """Resolve a text reference to its canonical entity.

        Args:
            reference: Text reference to resolve

        Returns:
            Canonical entity, or None if not found
        """
        normalized = self._normalize_name(reference)

        # Check alias map
        if normalized in self._alias_map:
            canonical_name = self._alias_map[normalized]
            return self._entities.get(canonical_name)

        # Check for similar entity
        similar_name = self._find_similar_entity(reference)
        if similar_name:
            return self._entities.get(similar_name)

        return None

    def get_entity_context(self, max_entities: int = 10) -> str:
        """Generate entity context string for prompts.

        Args:
            max_entities: Maximum entities to include

        Returns:
            Formatted entity context string
        """
        important = self.get_important_entities(max_entities)

        if not important:
            return ""

        lines = ["Key entities in this document:"]
        for entity in important:
            if entity.context:
                lines.append(f"- {entity.name} ({entity.type}): {entity.context}")
            else:
                lines.append(f"- {entity.name} ({entity.type})")

        return "\n".join(lines)

    def get_important_entities(self, top_k: int = 10) -> List[Entity]:
        """Get most important entities by mention frequency.

        Args:
            top_k: Number of entities to return

        Returns:
            List of top entities
        """
        entities = list(self._entities.values())
        entities.sort(key=lambda e: (e.mention_count, e.importance_score), reverse=True)
        return entities[:top_k]

    def get_entities_by_type(self, entity_type: str) -> List[Entity]:
        """Get all entities of a specific type.

        Args:
            entity_type: Type to filter by

        Returns:
            List of entities of that type
        """
        return [e for e in self._entities.values() if e.type == entity_type.lower()]

    def get_all_entities(self) -> Dict[str, Entity]:
        """Get all tracked entities.

        Returns:
            Dictionary of entity name -> Entity
        """
        return dict(self._entities)

    def increment_mentions(self, entity_names: List[str]) -> None:
        """Increment mention count for entities.

        Args:
            entity_names: Names of entities that were mentioned
        """
        for name in entity_names:
            entity = self.resolve_reference(name)
            if entity:
                entity.mention_count += 1

    def clear(self) -> None:
        """Clear all tracked entities."""
        self._entities.clear()
        self._alias_map.clear()

    @property
    def entity_count(self) -> int:
        """Number of tracked entities."""
        return len(self._entities)

    @property
    def entity_types(self) -> Set[str]:
        """Set of all entity types being tracked."""
        return {e.type for e in self._entities.values()}
