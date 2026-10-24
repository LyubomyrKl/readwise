#!/usr/bin/env python3

import json
import logging
import os
import pika
from typing import Optional, Dict, Any
import threading
import signal
import sys

logger = logging.getLogger(__name__)

def build_amqp_url() -> str:
    """Build AMQP URL from environment components."""
    host = os.environ['RABBITMQ_HOST']
    port = os.getenv('RABBITMQ_PORT', '5672')
    user = os.environ['RABBITMQ_USER']
    password = os.environ['RABBITMQ_PASS']
    # Disable heartbeat (0) to prevent timeout during long-running tasks
    # The connection will be kept alive by TCP keepalive instead
    heartbeat = os.getenv('RABBITMQ_HEARTBEAT', '0')
    return f"amqp://{user}:{password}@{host}:{port}/?heartbeat={heartbeat}"


class RabbitMQManager:
    def __init__(self, amqp_url: Optional[str] = None):
        self.amqp_url = amqp_url or build_amqp_url()
        self.connection = None
        self.channel = None
        self.consumer_tag = None
        self.is_consuming = False
    
    def send_message(self, queue: str, message: dict):
        """Send a message to a specific queue"""
        try:
            connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
            channel = connection.channel()
            
            # Ensure queue exists
            channel.queue_declare(queue=queue, durable=True)
            
            # Send message
            channel.basic_publish(
                exchange='',
                routing_key=queue,
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Make message persistent
                )
            )
            
            logger.info(f"📤 Sent message to {queue}: {message}")
            connection.close()
            
        except Exception as e:
            logger.error(f"❌ Failed to send message to {queue}: {e}")
            raise
    
    def send_summary_request(self, book_id: str, summary_type: str = 'extractive', summary_percent: float = 0.3,
                             strategy: Optional[str] = None, user_id: Optional[str] = None):
        """Send a message to trigger summarization.

        Every option the gateway attached to the extraction request is forwarded,
        so the summarization worker uses the strategy the user actually picked.
        """
        message = {
            'bookId': book_id,
            'task': 'summarize',
            'summaryType': summary_type,
            'summaryPercent': summary_percent,
        }
        if strategy:
            message['summarizationStrategy'] = strategy
        if user_id:
            message['userId'] = user_id
        self.send_message('summary_request', message)
    
    def setup_consumer(self, queue: str, callback, prefetch_count: int = 1):
        """Set up a consumer for a specific queue"""
        try:
            self.connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
            self.channel = self.connection.channel()
            
            # Declare queue with durability
            self.channel.queue_declare(queue=queue, durable=True)
            
            # Set QoS for fair dispatch
            self.channel.basic_qos(prefetch_count=prefetch_count)
            
            # Set up consumer with auto-ack disabled for reliability
            self.consumer_tag = self.channel.basic_consume(
                queue=queue,
                on_message_callback=callback,
                auto_ack=False  # Manual acknowledgment for reliability
            )
            
            logger.info(f"✅ Consumer set up for queue '{queue}' with prefetch_count={prefetch_count}")
            return self.connection, self.channel
            
        except Exception as e:
            logger.error(f"❌ Failed to set up consumer for queue '{queue}': {e}")
            raise

    def start_consuming(self, queue_name: str):
        """Start consuming messages with graceful shutdown"""
        def signal_handler(signum, frame):
            logger.info(f"🛑 Received signal {signum}, stopping consumer...")
            self.stop_consuming()
            sys.exit(0)

        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        try:
            self.is_consuming = True
            logger.info(f"📡 Starting to consume messages from '{queue_name}' queue...")
            logger.info("💡 Press CTRL+C to stop gracefully")

            self.channel.start_consuming()

        except KeyboardInterrupt:
            logger.info("🛑 KeyboardInterrupt received, stopping consumer...")
            self.stop_consuming()
            raise
        except Exception as e:
            error_msg = str(e)
            # Check if it's a connection error that can be recovered
            if any(term in error_msg for term in ["StreamLostError", "EOF", "Connection closed", "Channel is closed"]):
                logger.warning(f"⚠️ Connection lost during consumption: {e}")
                self.stop_consuming()
                # Don't raise, let the caller handle reconnection
            else:
                logger.error(f"❌ Error during consuming: {e}")
                self.stop_consuming()
                raise

    def stop_consuming(self):
        """Stop consuming messages gracefully"""
        if self.is_consuming and self.channel:
            logger.info("🛑 Stopping message consumption...")
            self.is_consuming = False
            
            try:
                # Stop consuming
                if self.consumer_tag:
                    self.channel.basic_cancel(self.consumer_tag)
                    
                self.channel.stop_consuming()
                logger.info("✅ Stopped consuming messages")
                
                # Close connections
                if self.connection and not self.connection.is_closed:
                    self.connection.close()
                    logger.info("✅ Connection closed")
                    
            except Exception as e:
                logger.error(f"❌ Error stopping consumer: {e}")

    def close(self):
        """Close the connection"""
        try:
            if self.connection and not self.connection.is_closed:
                self.connection.close()
                logger.info("✅ RabbitMQ connection closed")
        except Exception as e:
            logger.debug(f"Error closing connection: {e}")

    def get_queue_info(self, queue: str) -> Dict[str, Any]:
        """Get information about a queue"""
        try:
            connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
            channel = connection.channel()

            # Declare queue to ensure it exists
            method = channel.queue_declare(queue=queue, durable=True, passive=True)

            queue_info = {
                'queue': queue,
                'message_count': method.method.message_count,
                'consumer_count': method.method.consumer_count
            }

            connection.close()
            logger.info(f"📊 Queue '{queue}' info: {queue_info}")
            return queue_info

        except Exception as e:
            logger.error(f"❌ Failed to get queue info for '{queue}': {e}")
            return {'queue': queue, 'error': str(e)}