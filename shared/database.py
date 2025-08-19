#!/usr/bin/env python3

import logging
from prisma import Prisma

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.db = Prisma()
    
    async def connect(self):
        await self.db.connect()
        logger.info("Connected to database")
    
    async def disconnect(self):
        await self.db.disconnect()
        logger.info("Disconnected from database")
    
    async def get_book(self, book_id: str):
        return await self.db.book.find_unique(where={'id': book_id})
    
    async def update_book_status(self, book_id: str, status: str):
        data = {'status': status}

        return await self.db.book.update(
            where={'id': book_id},
            data=data
        )

    async def update_book_extraction(self, book_id: str, extraction_storage_key: str):
        return await self.db.book.update(
            where={'id': book_id},
            data={
                'extractionStorageKey': extraction_storage_key,
                'status': 'ready',
            }
        )
    
    async def update_book_summary(self, book_id: str, summary_type: str, summary_storage_key: str):
        return await self.db.book.update(
            where={'id': book_id},
            data={
                'summaryType': summary_type.lower(),
                'summaryStorageKey': summary_storage_key,
                'status': 'ready',
            }
        )