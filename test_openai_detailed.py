#!/usr/bin/env python3

import os
from dotenv import load_dotenv
import openai
import json

# Load environment variables
load_dotenv()

def test_openai_detailed():
    """Detailed OpenAI API test to diagnose issues"""
    
    # Get API key from environment
    api_key = os.getenv('OPENAI_API_KEY')
    
    if not api_key:
        print("❌ OPENAI_API_KEY not found in environment variables")
        return False
    
    print(f"✅ API Key: {api_key[:20]}...{api_key[-10:]}")
    print(f"   Length: {len(api_key)} characters")
    
    try:
        # Initialize OpenAI client
        client = openai.OpenAI(api_key=api_key)
        
        print("🔄 Testing minimal API call...")
        
        # Make the smallest possible request
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": "Hi"}
            ],
            max_tokens=1,
            temperature=0
        )
        
        # Print detailed response info
        print("✅ API call successful!")
        print(f"   Model used: {response.model}")
        print(f"   Response: '{response.choices[0].message.content}'")
        print(f"   Usage: {response.usage}")
        
        return True
        
    except openai.AuthenticationError as e:
        print(f"❌ Authentication Error: {e}")
        print("   This means your API key is invalid or revoked")
        return False
        
    except openai.PermissionDeniedError as e:
        print(f"❌ Permission Denied: {e}")
        print("   Your API key doesn't have access to this model")
        return False
        
    except openai.RateLimitError as e:
        print(f"❌ Rate Limit Error: {e}")
        print("   Details:")
        if hasattr(e, 'response') and e.response:
            print(f"   Status Code: {e.response.status_code}")
            try:
                error_data = e.response.json()
                print(f"   Error Data: {json.dumps(error_data, indent=2)}")
            except:
                print(f"   Raw Response: {e.response.text}")
        return False
        
    except openai.APIError as e:
        print(f"❌ API Error: {e}")
        return False
        
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        print(f"   Error Type: {type(e).__name__}")
        return False

def check_account_status():
    """Try to get account information"""
    api_key = os.getenv('OPENAI_API_KEY')
    
    try:
        client = openai.OpenAI(api_key=api_key)
        
        print("🔄 Checking available models...")
        models = client.models.list()
        
        available_models = [model.id for model in models.data if 'gpt' in model.id][:5]
        print(f"✅ Available GPT models: {available_models}")
        
    except Exception as e:
        print(f"❌ Cannot list models: {e}")

if __name__ == "__main__":
    print("🧪 Detailed OpenAI API Test...")
    print("=" * 60)
    
    # Check account status first
    check_account_status()
    
    print("\n" + "=" * 60)
    
    success = test_openai_detailed()
    
    print("=" * 60)
    if success:
        print("🎉 API connection working properly!")
    else:
        print("💥 There's an issue with your OpenAI setup.")
        print("\n💡 Troubleshooting tips:")
        print("   1. Check if your API key is active in OpenAI dashboard")
        print("   2. Verify you have credits/billing set up")
        print("   3. Check if you're on a free tier with usage limits")
        print("   4. Try creating a new API key")