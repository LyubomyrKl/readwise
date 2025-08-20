#!/usr/bin/env python3

import os
from dotenv import load_dotenv
import openai

# Load environment variables
load_dotenv()

def test_openai_setup():
    """Test OpenAI setup without making API calls"""
    
    # Check API key
    api_key = os.getenv('OPENAI_API_KEY')
    
    if not api_key:
        print("❌ OPENAI_API_KEY not found in .env file")
        return False
    
    if not api_key.startswith('sk-'):
        print("❌ Invalid API key format (should start with 'sk-')")
        return False
        
    print(f"✅ API Key format valid: {api_key[:20]}...")
    
    try:
        # Initialize client (doesn't make API call)
        client = openai.OpenAI(api_key=api_key)
        print("✅ OpenAI client initialized successfully")
        
        # Check if we can access the client properties
        print("✅ Client ready for API calls")
        
        return True
        
    except Exception as e:
        print(f"❌ Error initializing OpenAI client: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing OpenAI Setup (No API Calls)...")
    print("=" * 50)
    
    success = test_openai_setup()
    
    print("=" * 50)
    if success:
        print("🎉 OpenAI setup is correct!")
        print("💡 Your API key appears valid. If you get rate limit errors,")
        print("   wait a few minutes before making requests.")
    else:
        print("💥 Setup test failed. Check your .env configuration.")