#!/usr/bin/env python3

import os
import sys
from dotenv import load_dotenv
import openai

# Add parent directories to path for shared imports
sys.path.append(os.path.join(os.path.dirname(__file__), 'workers', 'summarization-worker'))

from text_summarizer import TextSummarizer

# Load environment variables
load_dotenv()

def test_ollama_connection():
    """Test Ollama API connection and basic functionality"""
    
    # Get configuration
    ollama_base_url = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    ollama_model = os.getenv('OLLAMA_MODEL', 'qwen2.5:14b-instruct-q5_k_m')
    
    print(f"✅ Ollama Base URL: {ollama_base_url}")
    print(f"✅ Ollama Model: {ollama_model}")
    
    try:
        # Initialize Ollama client using OpenAI-compatible API
        client = openai.OpenAI(
            base_url=f"{ollama_base_url}/v1",
            api_key="ollama"  # Ollama doesn't require a real API key
        )
        
        print("🔄 Testing Ollama API connection...")
        
        # Make a simple test request
        response = client.chat.completions.create(
            model=ollama_model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'Hello, Ollama connection successful!' in exactly 5 words."}
            ],
            max_tokens=20,
            temperature=0
        )
        
        # Check response
        if response and response.choices:
            result = response.choices[0].message.content.strip()
            print(f"✅ Ollama Response: {result}")
            print("✅ Ollama API connection successful!")
            return True
        else:
            print("❌ Empty response from Ollama API")
            return False
            
    except Exception as e:
        print(f"❌ Ollama API error: {e}")
        return False

def test_text_summarizer():
    """Test TextSummarizer with Ollama backend"""
    
    print("\n🧪 Testing TextSummarizer with Ollama...")
    
    try:
        # Initialize summarizer
        summarizer = TextSummarizer(
            s3_endpoint=os.getenv('S3_ENDPOINT', 'http://localhost:9000'),
            s3_access_key=os.getenv('S3_ACCESS_KEY_ID', 'minioadmin'),
            s3_secret_key=os.getenv('S3_SECRET_ACCESS_KEY', 'minioadmin'),
            ollama_base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
            ollama_model=os.getenv('OLLAMA_MODEL', 'qwen2.5:14b-instruct-q5_k_m')
        )
        
        print("✅ TextSummarizer initialized successfully")
        
        # Test with a small text sample
        test_text = """
        Artificial Intelligence (AI) is a broad field of computer science that aims to create systems capable of performing tasks that would normally require human intelligence. These tasks include learning, reasoning, problem-solving, perception, and language understanding.
        
        Machine Learning is a subset of AI that focuses on the development of algorithms and statistical models that enable computers to improve their performance on a specific task through experience, without being explicitly programmed for that task.
        
        Deep Learning, a subset of Machine Learning, uses artificial neural networks with multiple layers to model and understand complex patterns in data. It has been particularly successful in areas such as image recognition, natural language processing, and speech recognition.
        
        The applications of AI are vast and growing, ranging from autonomous vehicles and medical diagnosis to recommendation systems and virtual assistants. As AI technology continues to advance, it promises to transform many aspects of our daily lives and work.
        """
        
        print("🔄 Testing extractive summarization...")
        summary_html, metadata = summarizer.summarize_text(
            text=test_text.strip(),
            summary_type='extractive',
            summary_percent=0.5
        )
        
        print(f"✅ Extractive summarization complete")
        print(f"   - Original tokens: {metadata['original_tokens']}")
        print(f"   - Summary tokens: {metadata['summary_tokens']}")
        print(f"   - Compression ratio: {metadata['compression_ratio']:.1%}")
        print(f"   - Summary preview: {summary_html[:100]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ TextSummarizer test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Ollama Integration...")
    print("=" * 60)
    
    # Test basic connection
    connection_success = test_ollama_connection()
    
    print("=" * 60)
    
    if connection_success:
        # Test summarizer integration
        summarizer_success = test_text_summarizer()
        
        print("=" * 60)
        if summarizer_success:
            print("🎉 All tests passed! Ollama integration is working correctly.")
        else:
            print("💥 Summarizer test failed. Check your configuration.")
    else:
        print("💥 Connection test failed. Make sure Ollama is running and the model is available.")
        print("\nTo fix this:")
        print("1. Start Ollama: ollama serve")
        print("2. Pull the model: ollama pull qwen2.5:14b-instruct-q5_k_m")
        print("3. Verify model is available: ollama list")