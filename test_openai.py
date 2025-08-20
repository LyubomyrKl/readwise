#!/usr/bin/env python3

import os
from dotenv import load_dotenv
import openai

# Load environment variables
load_dotenv()

def test_openai_connection():
    """Test OpenAI API connection and basic functionality"""
    
    # Get API key from environment
    api_key = os.getenv('OPENAI_API_KEY')
    
    if not api_key:
        print("❌ OPENAI_API_KEY not found in environment variables")
        return False
    
    print(f"✅ API Key found: {api_key[:20]}...")
    
    try:
        # Initialize OpenAI client
        client = openai.OpenAI(api_key=api_key)
        
        print("🔄 Testing API connection...")
        
        # Make a simple test request
        response = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'Hello, API connection successful!' in exactly 5 words."}
            ],
            max_tokens=10,
            temperature=0
        )
        
        # Check response
        if response and response.choices:
            result = response.choices[0].message.content.strip()
            print(f"✅ API Response: {result}")
            print("✅ OpenAI API connection successful!")
            return True
        else:
            print("❌ Empty response from API")
            return False
            
    except openai.AuthenticationError:
        print("❌ Authentication failed - check your API key")
        return False
    except openai.RateLimitError:
        print("❌ Rate limit exceeded")
        return False
    except openai.APIError as e:
        print(f"❌ OpenAI API error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing OpenAI API Connection...")
    print("=" * 50)
    
    success = test_openai_connection()
    
    print("=" * 50)
    if success:
        print("🎉 All tests passed! OpenAI API is ready to use.")
    else:
        print("💥 Connection test failed. Please check your configuration.")