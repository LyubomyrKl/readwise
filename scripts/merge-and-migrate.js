import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Paths
const prismaDir = path.resolve('prisma');
const modelsDir = path.resolve('src/models'); // NEW location
const outFile = path.join(prismaDir, 'schema.prisma');

// Header (datasource + generator)
const header = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
`;

// Gather raw model files
const files = fs
  .readdirSync(modelsDir)
  .filter((f) => f.endsWith('.prisma') || f.endsWith('.model.prisma'))
  .sort();

if (!files.length) {
  console.error('No model files found in', modelsDir);
  process.exit(1);
}

// Track duplicates
const seenModels = new Set();
let merged = header + '\n';

for (const f of files) {
  const filePath = path.join(modelsDir, f);
  const content = fs.readFileSync(filePath, 'utf8').trim();

  // Extract model names
  const models = [
    ...content.matchAll(/^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm),
  ].map((m) => m[1]);
  const duplicates = models.filter((m) => seenModels.has(m));

  if (duplicates.length) {
    console.warn(`Skipping ${f} — duplicate models: ${duplicates.join(', ')}`);
    continue;
  }

  models.forEach((m) => seenModels.add(m));
  merged += `// ===== ${f} =====\n${content}\n\n`;
}

// Write merged schema.prisma
fs.writeFileSync(outFile, merged, 'utf8');
console.log(`Merged ${files.length} files into prisma/schema.prisma`);

// Run Prisma commands
try {
  execSync('npx prisma format', { stdio: 'inherit' });
  execSync('npx prisma migrate dev --name merged_update', { stdio: 'inherit' });
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}
