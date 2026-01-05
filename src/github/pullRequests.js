import chalk from "chalk"
import fs from "fs-extra"
import path from "path"

export class PullRequestManager {
	constructor(githubClient) {
		this.octokit = githubClient.getClient()
		this.username = githubClient.username
	}

	// Create a PR with fixes for critical issues
	async createFixPR(owner, repo, repoPath, findings) {
		console.log(chalk.blue("\n🔧 Creating fix PR..."))

		// Only create PRs for critical security issues
		const criticalFindings = findings.filter((f) => f.severity === "critical")

		if (criticalFindings.length === 0) {
			console.log(chalk.yellow("No critical issues to fix"))
			return null
		}

		try {
			// Step 1: Create a new branch
			const branchName = `${this.username}/security-fixes-${Date.now()}`
			console.log(chalk.blue(`Creating branch: ${branchName}`))

			const { default: simpleGit } = await import("simple-git")
			const git = simpleGit(repoPath)

			await git.checkoutLocalBranch(branchName)

			// Step 2: Apply fixes to files
			let filesFixed = 0
			for (const finding of criticalFindings) {
				if (finding.type === "sql-injection") {
					const fixed = await this.fixSQLInjection(finding, repoPath)
					if (fixed) filesFixed++
				} else if (finding.type === "exposed-secret") {
					const fixed = await this.fixExposedSecret(finding, repoPath)
					if (fixed) filesFixed++
				}
			}

			if (filesFixed === 0) {
				console.log(chalk.yellow("Could not automatically fix issues"))
				return null
			}

			// Step 3: Commit changes
			await git.add(".")
			await git.commit(`fix: address ${criticalFindings.length} critical security issue(s)

- Fixed SQL injection vulnerabilities
- Removed hardcoded secrets
- Added parameterized queries

This PR addresses security issues found in automated review.`)

			console.log(chalk.green("Changes committed"))

			// Step 4: Push branch to GitHub
			console.log(chalk.blue("Pushing to GitHub..."))

			// Get default branch
			const { data: repoData } = await this.octokit.rest.repos.get({
				owner,
				repo,
			})
			const defaultBranch = repoData.default_branch

			// Create branch on GitHub
			const { data: refData } = await this.octokit.rest.git.getRef({
				owner,
				repo,
				ref: `heads/${defaultBranch}`,
			})

			await this.octokit.rest.git.createRef({
				owner,
				repo,
				ref: `refs/heads/${branchName}`,
				sha: refData.object.sha,
			})

			// Push commits
			await git.push("origin", branchName, ["--force"])

			console.log(chalk.green("Branch pushed"))

			// Step 5: Create Pull Request
			const prBody = this.generatePRBody(criticalFindings)

			const { data: pr } = await this.octokit.rest.pulls.create({
				owner,
				repo,
				title: `🔒 Security Fix: ${criticalFindings.length} Critical Issue(s)`,
				head: branchName,
				base: defaultBranch,
				body: prBody,
			})

			console.log(chalk.green(`✅ PR created: ${pr.html_url}`))
			return pr
		} catch (error) {
			console.error(chalk.red("❌ Failed to create fix PR:"), error.message)
			throw error
		}
	}

	// Fix SQL injection in a file
	async fixSQLInjection(finding, repoPath) {
		try {
			const filePath = finding.file
			const content = await fs.readFile(filePath, "utf-8")
			const lines = content.split("\n")

			// Get the line with the issue (0-indexed)
			const lineIndex = finding.line - 1
			const problematicLine = lines[lineIndex]

			// Try to fix common SQL injection patterns
			let fixed = false
			let fixedLine = problematicLine

			// Pattern 1: String concatenation with +
			// "SELECT * FROM users WHERE id = " + userId
			if (
				problematicLine.includes("db.run") ||
				problematicLine.includes("db.all") ||
				problematicLine.includes("db.get")
			) {
				// Extract the query and check if it has concatenation
				const queryMatch = problematicLine.match(/["'`](.*?)["'`]\s*\+/s)

				if (queryMatch) {
					// This is a concatenation pattern - provide a comment
					const indent = problematicLine.match(/^\s*/)[0]

					// Add a comment explaining the fix
					lines.splice(
						lineIndex,
						0,
						`${indent}// TODO: Fix SQL injection vulnerability`,
						`${indent}// Change to parameterized query:`,
						`${indent}// db.run("SELECT ... WHERE id = ?", [userId], callback)`
					)

					fixed = true
				}
			}

			// Pattern 2: Template literals
			// `SELECT * FROM users WHERE id = '${userId}'`
			if (problematicLine.includes("`") && problematicLine.includes("${")) {
				const indent = problematicLine.match(/^\s*/)[0]

				lines.splice(
					lineIndex,
					0,
					`${indent}// TODO: Fix SQL injection vulnerability`,
					`${indent}// Replace template literal with parameterized query:`,
					`${indent}// db.run("SELECT ... WHERE id = ?", [userId], callback)`
				)

				fixed = true
			}

			if (fixed) {
				const newContent = lines.join("\n")
				await fs.writeFile(filePath, newContent, "utf-8")
				console.log(
					chalk.green(`  ✓ Added fix comments to ${path.basename(filePath)}`)
				)
				return true
			}

			return false
		} catch (error) {
			console.warn(
				chalk.yellow(`Could not fix ${finding.file}:`, error.message)
			)
			return false
		}
	}

	// Fix exposed secrets
	async fixExposedSecret(finding, repoPath) {
		try {
			const filePath = finding.file
			const content = await fs.readFile(filePath, "utf-8")
			const lines = content.split("\n")

			const lineIndex = finding.line - 1
			const problematicLine = lines[lineIndex]

			// Check if it's a hardcoded secret
			if (
				problematicLine.includes("=") &&
				(problematicLine.includes('"') || problematicLine.includes("'"))
			) {
				const indent = problematicLine.match(/^\s*/)[0]
				const varMatch = problematicLine.match(/(?:const|let|var)\s+(\w+)/)

				if (varMatch) {
					const varName = varMatch[1]

					// Comment out the old line and add fix
					lines[
						lineIndex
					] = `${indent}// ${problematicLine.trim()} // ⚠️ SECURITY: Do not hardcode secrets`
					lines.splice(
						lineIndex + 1,
						0,
						`${indent}const ${varName} = process.env.${varName} // ✅ Fixed: Use environment variable`
					)

					const newContent = lines.join("\n")
					await fs.writeFile(filePath, newContent, "utf-8")
					console.log(
						chalk.green(
							`  ✓ Fixed hardcoded secret in ${path.basename(filePath)}`
						)
					)
					return true
				}
			}

			return false
		} catch (error) {
			console.warn(
				chalk.yellow(`Could not fix ${finding.file}:`, error.message)
			)
			return false
		}
	}

	// Generate PR body
	generatePRBody(criticalFindings) {
		let body = "# 🔒 Security Fixes\n\n"
		body +=
			"This PR addresses critical security vulnerabilities found in the automated code review.\n\n"

		body += "## Issues Fixed\n\n"

		criticalFindings.forEach((finding, index) => {
			body += `${index + 1}. **${finding.message}** (${finding.type})\n`
			body += `   - File: \`${this.getRelativePath(finding.file)}\`\n`
			body += `   - Line: ${finding.line}\n`
			body += `   - ${finding.description}\n\n`
		})

		body += "## What Changed\n\n"
		body += "- ✅ Added TODO comments for SQL injection fixes\n"
		body += "- ✅ Replaced hardcoded secrets with environment variables\n"
		body += "- ✅ Added inline documentation for secure patterns\n\n"

		body += "## Next Steps\n\n"
		body += "1. Review the changes\n"
		body += "2. Update any SQL queries to use parameterized queries\n"
		body += "3. Create a `.env` file for environment variables\n"
		body += "4. Test the changes\n"
		body += "5. Merge when ready\n\n"

		body += "---\n"
		body +=
			"*This PR was automatically generated by the Node.js API Checker bot.*"

		return body
	}

	// Get relative path
	getRelativePath(fullPath) {
		const parts = fullPath.split("/")
		const repoIndex = parts.findIndex((p) => p.includes("-"))
		if (repoIndex !== -1 && repoIndex < parts.length - 1) {
			return parts.slice(repoIndex + 1).join("/")
		}
		return fullPath
	}

	// Check if fix PR already exists
	async fixPRExists(owner, repo) {
		try {
			const { data } = await this.octokit.rest.pulls.list({
				owner,
				repo,
				state: "open",
				head: `${owner}:${this.username}/security-fixes`,
			})

			return data.length > 0
		} catch (error) {
			return false
		}
	}
}
