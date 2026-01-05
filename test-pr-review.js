import { GitHubClient } from "./src/github/client.js"
import { GitManager } from "./src/utils/git.js"
import { SecurityAnalyzer } from "./src/analyzers/security.js"
import { StructureAnalyzer } from "./src/analyzers/structure.js"
import { ReviewManager } from "./src/github/reviews.js"
import chalk from "chalk"

async function testPRReview() {
	try {
		const repoUrl = "https://github.com/arnold-keyStone/node-api"

		console.log(chalk.blue.bold("🤖 PR Review Bot\n"))

		// Step 1: Setup
		const githubClient = new GitHubClient()
		await githubClient.verifyAuth()
		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)

		console.log(chalk.blue(`📋 Checking PRs in: ${owner}/${repo}\n`))

		// Step 2: Get open PRs
		const reviewManager = new ReviewManager(githubClient)
		const openPRs = await reviewManager.getOpenPRs(owner, repo)

		if (openPRs.length === 0) {
			console.log(chalk.yellow("⚠️  No open PRs found"))
			console.log(chalk.blue("\nTo test this feature:"))
			console.log("1. As arnold-keyStone, create a new branch")
			console.log("2. Make some changes to app.js")
			console.log("3. Push and open a Pull Request")
			console.log("4. Run this script again")
			return
		}

		console.log(chalk.green(`✅ Found ${openPRs.length} open PR(s)\n`))

		// Step 3: Review each PR
		for (const pr of openPRs) {
			console.log(chalk.blue(`\n📄 PR #${pr.number}: ${pr.title}`))
			console.log(`   Author: ${pr.user.login}`)
			console.log(`   Branch: ${pr.head.ref} → ${pr.base.ref}`)

			// Check if already reviewed
			const alreadyReviewed = await reviewManager.hasBeenReviewed(
				owner,
				repo,
				pr.number
			)
			if (alreadyReviewed) {
				console.log(
					chalk.yellow(
						`   ⚠️  Already reviewed by ${githubClient.username}, skipping...`
					)
				)
				continue
			}

			// Step 4: Get PR files
			const prFiles = await reviewManager.getPRFiles(owner, repo, pr.number)
			console.log(`   📁 ${prFiles.length} file(s) changed`)

			// Step 5: Clone and analyze the PR branch
			const gitManager = new GitManager()
			const branchUrl = `https://github.com/${owner}/${repo}.git`

			// Clone the specific branch
			const repoPath = await gitManager.cloneRepo(branchUrl, owner, repo)

			// Checkout the PR branch
			const { simpleGit } = await import("simple-git")
			const git = simpleGit(repoPath)
			await git.checkout(pr.head.ref)

			console.log(chalk.yellow(`   🔍 Analyzing ${pr.head.ref} branch...`))

			// Step 6: Analyze the code
			const sourceFiles = await gitManager.getSourceFiles(repoPath)

			const securityAnalyzer = new SecurityAnalyzer()
			const securityFindings = await securityAnalyzer.analyze(sourceFiles)

			const structureAnalyzer = new StructureAnalyzer()
			const structureFindings = await structureAnalyzer.analyze(
				repoPath,
				sourceFiles
			)

			const allFindings = [...securityFindings, ...structureFindings]

			// Step 7: Display findings
			const critical = allFindings.filter(
				(f) => f.severity === "critical"
			).length
			const warnings = allFindings.filter(
				(f) => f.severity === "warning"
			).length
			const info = allFindings.filter((f) => f.severity === "info").length

			console.log(
				chalk.bold(
					`   📊 Found: ${critical} critical, ${warnings} warnings, ${info} info`
				)
			)

			// Step 8: Create review
			if (allFindings.length > 0) {
				await reviewManager.createReview(
					owner,
					repo,
					pr.number,
					allFindings,
					prFiles
				)
				console.log(chalk.green(`   ✅ Review posted!`))
			} else {
				console.log(chalk.green(`   ✅ No issues found - PR looks good!`))
			}

			// Step 9: Cleanup
			await gitManager.cleanup(repoPath)
		}

		console.log(chalk.green.bold("\n✨ PR review complete!\n"))
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error.message)
		console.error(error.stack)
	}
}

testPRReview()
