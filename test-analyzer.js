import { GitHubClient } from "./src/github/client.js"
import { GitManager } from "./src/utils/git.js"
import { SecurityAnalyzer } from "./src/analyzers/security.js"
import { StructureAnalyzer } from "./src/analyzers/structure.js"
import { IssueManager } from "./src/github/issues.js"
import chalk from "chalk"

async function test() {
	try {
		const repoUrl = "https://github.com/arnold-keyStone/node-api"

		console.log(chalk.blue.bold("🤖 Node.js API Checker\n"))

		// Step 1: Setup
		const githubClient = new GitHubClient()
		await githubClient.verifyAuth()
		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)

		console.log(chalk.blue(`\n📋 Analyzing: ${owner}/${repo}\n`))

		// Step 2: Clone the repo
		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)

		// Step 3: Get all source files
		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		console.log(`📁 Found ${sourceFiles.length} source files\n`)

		// Step 4: Run security analysis
		console.log(chalk.yellow("🔒 Running security analysis..."))
		const securityAnalyzer = new SecurityAnalyzer()
		const securityFindings = await securityAnalyzer.analyze(sourceFiles)

		// Step 5: Run structure analysis
		console.log(chalk.yellow("📁 Running structure analysis..."))
		const structureAnalyzer = new StructureAnalyzer()
		const structureFindings = await structureAnalyzer.analyze(
			repoPath,
			sourceFiles
		)

		// Step 6: Combine findings
		const allFindings = [...securityFindings, ...structureFindings]

		// Step 7: Display summary
		console.log(chalk.bold("\n📊 ANALYSIS COMPLETE"))
		console.log("─".repeat(50))

		const criticalCount = allFindings.filter(
			(f) => f.severity === "critical"
		).length
		const warningCount = allFindings.filter(
			(f) => f.severity === "warning"
		).length
		const infoCount = allFindings.filter((f) => f.severity === "info").length

		console.log(`Total issues: ${allFindings.length}`)
		console.log(chalk.red(`  Critical: ${criticalCount}`))
		console.log(chalk.yellow(`  Warnings: ${warningCount}`))
		console.log(chalk.blue(`  Info: ${infoCount}`))

		// Step 8: Create GitHub issue if findings exist
		if (allFindings.length > 0) {
			const issueManager = new IssueManager(githubClient)

			// Check if issue already exists
			const title = `🔍 API Review: ${criticalCount} Critical, ${warningCount} Warnings, ${infoCount} Suggestions`
			const exists = await issueManager.issueExists(owner, repo, title)

			if (exists) {
				console.log(
					chalk.yellow("\n⚠️  Similar issue already exists, skipping creation")
				)
			} else {
				const issue = await issueManager.createReviewIssue(
					owner,
					repo,
					allFindings
				)
				console.log(chalk.green.bold("\n✨ Review posted to GitHub!"))
				console.log(chalk.blue(`   View at: ${issue.html_url}`))
			}
		} else {
			console.log(chalk.green("\n✅ No issues found! Great job!"))
		}

		// Step 9: Cleanup
		await gitManager.cleanup(repoPath)
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error.message)
		console.error(error.stack)
	}
}

test()
