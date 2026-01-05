import chalk from "chalk"

export class ReviewManager {
	constructor(githubClient) {
		this.octokit = githubClient.getClient()
		this.username = githubClient.username
	}

	// Get open PRs in a repository
	async getOpenPRs(owner, repo) {
		try {
			const { data } = await this.octokit.rest.pulls.list({
				owner,
				repo,
				state: "open",
			})
			// Filter out PRs created by the bot itself
			return data.filter((pr) => pr.user.login !== this.username)
		} catch (error) {
			console.error(chalk.red("❌ Failed to get PRs:"), error.message)
			throw error
		}
	}

	// Get files changed in a PR
	async getPRFiles(owner, repo, prNumber) {
		try {
			const { data } = await this.octokit.rest.pulls.listFiles({
				owner,
				repo,
				pull_number: prNumber,
			})
			return data
		} catch (error) {
			console.error(chalk.red("❌ Failed to get PR files:"), error.message)
			throw error
		}
	}

	// Create a PR review with comments
	async createReview(owner, repo, prNumber, findings, prFiles) {
		console.log(chalk.blue(`\n📝 Creating review for PR #${prNumber}...`))

		// Map findings to PR files and create inline comments
		const comments = this.mapFindingsToPRComments(findings, prFiles)

		// Separate critical from non-critical
		const critical = findings.filter((f) => f.severity === "critical")
		const warnings = findings.filter((f) => f.severity === "warning")

		// Generate review body
		const body = this.generateReviewBody(
			critical,
			warnings,
			findings.length - critical.length - warnings.length
		)

		// Determine review event
		const event = critical.length > 0 ? "REQUEST_CHANGES" : "COMMENT"

		try {
			const { data } = await this.octokit.rest.pulls.createReview({
				owner,
				repo,
				pull_number: prNumber,
				body,
				event, // REQUEST_CHANGES, APPROVE, or COMMENT
				comments, // Inline comments
			})

			console.log(chalk.green(`✅ Review created: ${data.html_url}`))
			return data
		} catch (error) {
			console.error(chalk.red("❌ Failed to create review:"), error.message)

			// Fallback: create a simple comment if review fails
			try {
				await this.octokit.rest.issues.createComment({
					owner,
					repo,
					issue_number: prNumber,
					body,
				})
				console.log(chalk.yellow("⚠️  Created as comment instead of review"))
			} catch (commentError) {
				console.error(
					chalk.red("❌ Could not even create comment:"),
					commentError.message
				)
			}

			throw error
		}
	}

	// Map findings to inline PR comments
	mapFindingsToPRComments(findings, prFiles) {
		const comments = []

		for (const finding of findings) {
			// Only create inline comments for findings with specific lines
			if (finding.line === "N/A" || !finding.line) continue

			// Find the matching file in the PR
			const fileName = this.extractFileName(finding.file)
			const prFile = prFiles.find(
				(f) => f.filename === fileName || f.filename.endsWith(fileName)
			)

			if (!prFile) continue

			// Create inline comment
			const comment = {
				path: prFile.filename,
				line: parseInt(finding.line),
				side: "RIGHT", // Comment on the new version
				body: this.formatInlineComment(finding),
			}

			comments.push(comment)
		}

		return comments
	}

	// Format an inline comment
	formatInlineComment(finding) {
		const severityEmoji = {
			critical: "🚨",
			warning: "⚠️",
			info: "💡",
		}

		let comment = `${severityEmoji[finding.severity]} **${
			finding.message
		}**\n\n`
		comment += `${finding.description}\n\n`

		if (finding.recommendation) {
			comment += `**How to fix:**\n\`\`\`javascript\n${finding.recommendation}\n\`\`\``
		}

		return comment
	}

	// Generate review body (overall comment)
	generateReviewBody(critical, warnings, info) {
		let body = "# 🔍 Code Review\n\n"

		if (critical.length > 0) {
			body += `## 🚨 Critical Issues Found: ${critical.length}\n\n`
			body +=
				"I found some **security vulnerabilities** that need to be fixed before this can be merged.\n\n"

			critical.forEach((finding, index) => {
				body += `${index + 1}. **${finding.message}** (Line ${finding.line})\n`
			})

			body +=
				"\n**Action Required:** Please address all critical issues and push new commits.\n\n"
		}

		if (warnings.length > 0) {
			body += `## ⚠️ Warnings: ${warnings.length}\n\n`
			body +=
				"Some best practices violations were found. These should be addressed:\n\n"

			warnings.forEach((finding, index) => {
				body += `${index + 1}. ${finding.message}\n`
			})
			body += "\n"
		}

		if (critical.length === 0 && warnings.length === 0) {
			body += "## ✅ Looks Good!\n\n"
			body += "No security issues or critical problems found. "

			if (info > 0) {
				body += `There are ${info} suggestions for improvement that are optional.`
			} else {
				body += "Great work! 🎉"
			}
		}

		body += "\n---\n"
		body += "*Automated review by Node.js API Checker*"

		return body
	}

	// Extract just the filename from a full path
	extractFileName(fullPath) {
		if (!fullPath) return ""
		const parts = fullPath.split("/")
		return parts[parts.length - 1]
	}

	// Check if a PR has already been reviewed by us
	async hasBeenReviewed(owner, repo, prNumber) {
		try {
			const { data } = await this.octokit.rest.pulls.listReviews({
				owner,
				repo,
				pull_number: prNumber,
			})

			return data.some((review) => review.user.login === this.username)
		} catch (error) {
			console.warn("Could not check existing reviews:", error.message)
			return false
		}
	}
}
