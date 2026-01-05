import chalk from "chalk"

export class IssueManager {
	constructor(githubClient) {
		this.octokit = githubClient.getClient()
		this.username = githubClient.username
	}

	// Create a comprehensive review issue
	async createReviewIssue(owner, repo, findings) {
		console.log(chalk.blue("\n📝 Creating GitHub issue..."))

		// Separate findings by severity
		const critical = findings.filter((f) => f.severity === "critical")
		const warnings = findings.filter((f) => f.severity === "warning")
		const info = findings.filter((f) => f.severity === "info")

		// Generate issue title
		const title = `🔍 API Review: ${critical.length} Critical, ${warnings.length} Warnings, ${info.length} Suggestions`

		// Generate issue body
		const body = this.generateIssueBody(critical, warnings, info)

		try {
			// Try to create issue with labels first
			let issueData = {
				owner,
				repo,
				title,
				body,
				assignees: [owner], // Assign to repo owner
			}

			// Try to add labels if they exist
			try {
				const { data } = await this.octokit.rest.issues.create({
					...issueData,
					labels: ["code-review", "automated"],
				})
				console.log(chalk.green(`✅ Issue created: ${data.html_url}`))
				return data
			} catch (labelError) {
				// If labels fail, create without them
				console.log(
					chalk.yellow(
						"⚠️  Could not add labels, creating issue without labels..."
					)
				)
				const { data } = await this.octokit.rest.issues.create(issueData)
				console.log(chalk.green(`✅ Issue created: ${data.html_url}`))
				return data
			}
		} catch (error) {
			console.error(chalk.red("❌ Failed to create issue:"), error.message)
			throw error
		}
	}

	// Generate markdown issue body
	generateIssueBody(critical, warnings, info) {
		const sections = []

		// Header
		sections.push("# 🔍 API Security & Best Practices Review")
		sections.push("")
		sections.push(
			"Hey! I've reviewed your Node.js API and found some areas for improvement."
		)
		sections.push("")

		// Summary
		sections.push("## 📊 Summary")
		sections.push("")
		sections.push(`- **Critical Issues:** ${critical.length} 🚨`)
		sections.push(`- **Warnings:** ${warnings.length} ⚠️`)
		sections.push(`- **Suggestions:** ${info.length} 💡`)
		sections.push("")
		sections.push("---")
		sections.push("")

		// Critical Issues
		if (critical.length > 0) {
			sections.push("## 🚨 Critical Issues (Must Fix)")
			sections.push("")
			sections.push(
				"These are security vulnerabilities that need immediate attention."
			)
			sections.push("")

			critical.forEach((finding, index) => {
				sections.push(`### ${index + 1}. ${finding.message}`)
				sections.push("")
				sections.push(`**Type:** \`${finding.type}\``)
				sections.push(`**File:** \`${this.getRelativePath(finding.file)}\``)
				if (finding.line !== "N/A") {
					sections.push(`**Line:** ${finding.line}`)
				}
				sections.push("")
				sections.push(`**Issue:** ${finding.description}`)
				sections.push("")

				if (finding.snippet) {
					sections.push("**Current Code:**")
					sections.push("```javascript")
					sections.push(finding.snippet.trim())
					sections.push("```")
					sections.push("")
				}

				sections.push("**How to Fix:**")
				sections.push("```javascript")
				sections.push(finding.recommendation)
				sections.push("```")
				sections.push("")
				sections.push("---")
				sections.push("")
			})
		}

		// Warnings
		if (warnings.length > 0) {
			sections.push("## ⚠️ Warnings (Should Fix)")
			sections.push("")
			sections.push(
				"These are best practice violations that should be addressed."
			)
			sections.push("")

			warnings.forEach((finding, index) => {
				sections.push(`### ${index + 1}. ${finding.message}`)
				sections.push("")
				sections.push(`**Type:** \`${finding.type}\``)
				if (finding.file && finding.line !== "N/A") {
					sections.push(`**File:** \`${this.getRelativePath(finding.file)}\``)
				}
				sections.push("")
				sections.push(`**Issue:** ${finding.description}`)
				sections.push("")
				sections.push("**Recommendation:**")
				sections.push("```")
				sections.push(finding.recommendation)
				sections.push("```")
				sections.push("")
				sections.push("---")
				sections.push("")
			})
		}

		// Suggestions
		if (info.length > 0) {
			sections.push("## 💡 Suggestions (Nice to Have)")
			sections.push("")

			info.forEach((finding, index) => {
				sections.push(
					`${index + 1}. **${finding.message}** - ${finding.description}`
				)
			})
			sections.push("")
			sections.push("---")
			sections.push("")
		}

		// Footer
		sections.push("## 🎯 Next Steps")
		sections.push("")
		sections.push("1. Fix all critical security issues first")
		sections.push("2. Address warnings about code organization")
		sections.push(
			"3. Consider implementing suggestions for better maintainability"
		)
		sections.push("")
		sections.push("**Questions?** Feel free to ask in the comments below!")
		sections.push("")
		sections.push("---")
		sections.push(
			"*This review was generated automatically by the Node.js API Checker bot.*"
		)

		return sections.join("\n")
	}

	// Get relative path (remove absolute path prefix)
	getRelativePath(fullPath) {
		const parts = fullPath.split("/")
		// Find the repo name in the path
		const repoIndex = parts.findIndex((p) => p.includes("-"))
		if (repoIndex !== -1 && repoIndex < parts.length - 1) {
			return parts.slice(repoIndex + 1).join("/")
		}
		return fullPath
	}

	// Check if an issue already exists with this title
	async issueExists(owner, repo, title) {
		try {
			const { data } = await this.octokit.rest.issues.listForRepo({
				owner,
				repo,
				state: "open",
				creator: this.username,
			})

			return data.some((issue) => issue.title === title)
		} catch (error) {
			console.warn("Could not check existing issues:", error.message)
			return false
		}
	}
}
