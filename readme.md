# 🤖 Node.js API Checker

A GitHub bot for automated code reviews of Node.js REST APIs. Designed for educators and code reviewers to provide consistent, detailed feedback on student and junior developer projects.

## 🎯 What Is This For?

### For Educators & Teachers

- **Automated code reviews** for student REST API projects
- **Consistent feedback** across multiple students
- **GitHub presence** - all reviews appear as your activity
- **Time-saving** - review 30+ projects quickly
- **Teaching tool** - shows students professional code review practices

### For Development Teams

- **Onboarding** - Help junior developers learn best practices
- **Quality gates** - Automated checks before code review
- **Security scanning** - Catch common vulnerabilities early
- **Standardization** - Enforce team conventions

### What It Detects

#### Security Issues (Critical)

- 🚨 SQL injection vulnerabilities
- 🚨 Hardcoded secrets (API keys, passwords)
- 🚨 Authentication bypass risks

#### Code Quality (Warnings)

- ⚠️ Missing folder structure (routes/, controllers/, models/)
- ⚠️ Monolithic files (all logic in one file)
- ⚠️ Missing separation of concerns
- ⚠️ Routes and database logic mixed together

#### Project Health (Info)

- 💡 Missing essential files (.gitignore, .env.example, README)
- 💡 Missing documentation

## ✨ Features

### 1. Issue Creation

Creates comprehensive GitHub issues with:

- Severity-based categorization (Critical, Warning, Info)
- Code snippets showing the problem
- Specific recommendations for fixes
- Line numbers for easy navigation

### 2. Pull Request Reviews

Automatically reviews open PRs with:

- Inline comments on specific problematic lines
- Overall review summary
- "Request Changes" for critical issues
- "Comment" for warnings and suggestions

### 3. Fix PR Generation

Creates pull requests with:

- Fixes for critical security issues
- TODO comments showing how to fix
- Educational explanations
- Ready-to-merge or learn-from code

### 4. Local Analysis

Analyze repositories without GitHub interaction:

- See results in terminal
- No GitHub API calls
- Perfect for testing

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Git installed
- GitHub account
- GitHub Personal Access Token

## Installation

```bash
npm install -g nodejs-api-checker
```

## Usage

1. **Clone the repository**

```bash
   git clone https://github.com/lostmart/NodeJs-api-checker
   cd nodejs-api-checker
```

2. **Install dependencies**

```bash
   npm install
```

3. **Create GitHub Personal Access Token**

   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Name: "API Checker Bot"
   - Select scopes:
     - ✅ `repo` (full control of repositories)
     - ✅ `workflow` (optional)
   - Generate and copy the token

4. **Configure environment variables**

```bash
   cp .env.example .env
```

- Edit `.env` and add:

```bash
   GITHUB_TOKEN=ghp_your_token_here
   GITHUB_USERNAME=your_github_username
```

5. **Test authentication**

```bash
   npm start analyze https://github.com/octocat/Hello-World
```

### Basic Commands

```bash
# Analyze a repository (local only, no GitHub interaction)
npm start analyze

# Create a GitHub issue with findings
npm start issue

# Review all open pull requests
npm start review

# Create a fix PR for critical issues
npm start fix

# Show help
npm start -- --help
```

### Real-World Examples

```bash
# When student gives you access to their repo:
npm start issue https://github.com/student1/project-api

# When student opens a PR:
npm start review https://github.com/student1/project-api

# When critical issues need fixing:
npm start fix https://github.com/student1/project-api
```
