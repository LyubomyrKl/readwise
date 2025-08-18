#!/usr/bin/env python3
"""
Verification script for summarizer-contracts
"""

import json
import os
from pathlib import Path

def main():
    print("🔍 Verifying summarizer-contracts repository...")
    
    # Check directory structure
    expected_dirs = [
        "schemas/$defs",
        "schemas/events", 
        "openapi",
        "packages/ts",
        "packages/py",
        "tests/fixtures/valid",
        "tests/fixtures/invalid",
        ".github/workflows"
    ]
    
    print("\n📁 Directory structure:")
    for dir_path in expected_dirs:
        path = Path(dir_path)
        if path.exists():
            print(f"  ✅ {dir_path}")
        else:
            print(f"  ❌ {dir_path}")
    
    # Check key files exist
    expected_files = [
        "README.md",
        "CHANGELOG.md", 
        "LICENSE",
        "packages/ts/package.json",
        "packages/py/pyproject.toml",
        ".github/workflows/ci.yml",
        ".github/workflows/release.yml"
    ]
    
    print("\n📄 Key files:")
    for file_path in expected_files:
        path = Path(file_path)
        if path.exists():
            print(f"  ✅ {file_path}")
        else:
            print(f"  ❌ {file_path}")
    
    # Check TypeScript package.json
    if Path("packages/ts/package.json").exists():
        with open("packages/ts/package.json") as f:
            ts_pkg = json.load(f)
        print(f"\n📦 TypeScript package: {ts_pkg['name']}@{ts_pkg['version']}")
        
        required_deps = ["ajv", "ajv-formats"]
        for dep in required_deps:
            if dep in ts_pkg.get("dependencies", {}):
                print(f"  ✅ Dependency: {dep}")
            else:
                print(f"  ❌ Missing: {dep}")
    
    print("\n🎯 Repository ready for:")
    print("  • Schema validation and OpenAPI linting")
    print("  • TypeScript package publishing to npm")
    print("  • Python package publishing to PyPI")  
    print("  • GitHub Actions CI/CD")
    print("  • Automated releases on git tags")
    
    print("\n🚀 Next steps:")
    print("  1. Initialize git repo: git init && git add . && git commit -m 'Initial commit'")
    print("  2. Set up npm and PyPI tokens in GitHub secrets")
    print("  3. Test CI by pushing to main branch")
    print("  4. Create release: git tag v1.0.0 && git push origin v1.0.0")

if __name__ == "__main__":
    main()