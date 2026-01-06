#!/usr/bin/env node

import { Command } from "commander"
import chalk from "chalk"
import ora from "ora"
import { GitHubClient } from "./github/client.js"
import { GitManager } from "./utils/git.js"
import { SecurityAnalyzer } from "./analyzers/security.js"
import { StructureAnalyzer } from "./analyzers/structure.js"
import { IssueManager } from "./github/issues.js"
import { ReviewManager } from "./github/reviews.js"
import { PullRequestManager } from "./github/pullRequests.js"

const program = new Command()

// CLI metadata
program
	.name("api-checker")
	.description(
		"🤖 Node.js API Review Bot - Automated code reviews for REST APIs"
	)
	.version("1.0.0")

// Command: Create Issue
program
	.command("issue <repo-url>")
	.description("Analyze a repository and create a GitHub issue with findings")
	.action(async (repoUrl) => {
		await runIssueCommand(repoUrl)
	})

// Command: Review PRs
program
	.command("review <repo-url>")
	.description("Review all open pull requests in a repository")
	.action(async (repoUrl) => {
		await runReviewCommand(repoUrl)
	})

// Command: Create Fix PR
program
	.command("fix <repo-url>")
	.description("Create a pull request with fixes for critical security issues")
	.action(async (repoUrl) => {
		await runFixCommand(repoUrl)
	})

// Command: Cleanup Bot Branches
program
	.command("cleanup <repo-url>")
	.description("Delete branches from closed/merged bot PRs")
	.option("-a, --all", "Delete all bot branches (including open PRs)")
	.action(async (repoUrl, options) => {
		await runCleanupCommand(repoUrl, options)
	})

// Command: Analyze (local only, no GitHub interaction)
program
	.command("analyze <repo-url>")
	.description(
		"Analyze a repository and display results (no GitHub interaction)"
	)
	.action(async (repoUrl) => {
		await runAnalyzeCommand(repoUrl)
	})

// Parse arguments
program.parse()

// ============================================================================
// COMMAND IMPLEMENTATIONS
// ============================================================================

async function runIssueCommand(repoUrl) {
	const spinner = ora("Starting analysis...").start()

	try {
		// Setup
		const githubClient = new GitHubClient()
		spinner.text = "Authenticating with GitHub..."
		await githubClient.verifyAuth()

		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)
		spinner.succeed(chalk.green(`Authenticated as ${githubClient.username}`))

		console.log(chalk.blue(`\n📋 Analyzing: ${owner}/${repo}\n`))

		// Clone repo
		spinner.start("Cloning repository...")
		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)
		spinner.succeed("Repository cloned")

		// Get source files
		spinner.start("Finding source files...")
		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		spinner.succeed(`Found ${sourceFiles.length} source file(s)`)

		// Run analyses
		spinner.start("Running security analysis...")
		const securityAnalyzer = new SecurityAnalyzer()
		const securityFindings = await securityAnalyzer.analyze(sourceFiles)
		spinner.succeed("Security analysis complete")

		spinner.start("Running structure analysis...")
		const structureAnalyzer = new StructureAnalyzer()
		const structureFindings = await structureAnalyzer.analyze(
			repoPath,
			sourceFiles
		)
		spinner.succeed("Structure analysis complete")

		// Combine findings
		const allFindings = [...securityFindings, ...structureFindings]

		// Display summary
		displaySummary(allFindings)

		// Create GitHub issue
		if (allFindings.length > 0) {
			spinner.start("Creating GitHub issue...")
			const issueManager = new IssueManager(githubClient)

			// Check if similar issue exists
			const criticalCount = allFindings.filter(
				(f) => f.severity === "critical"
			).length
			const warningCount = allFindings.filter(
				(f) => f.severity === "warning"
			).length
			const infoCount = allFindings.filter((f) => f.severity === "info").length

			const title = `🔍 API Review: ${criticalCount} Critical, ${warningCount} Warnings, ${infoCount} Suggestions`
			const exists = await issueManager.issueExists(owner, repo, title)

			if (exists) {
				spinner.warn(chalk.yellow("Similar issue already exists"))
			} else {
				const issue = await issueManager.createReviewIssue(
					owner,
					repo,
					allFindings
				)
				spinner.succeed(chalk.green("Issue created!"))
				console.log(chalk.blue(`\n🔗 View at: ${issue.html_url}\n`))
			}
		} else {
			console.log(chalk.green("\n✅ No issues found! Repository looks good.\n"))
		}

		// Cleanup
		await gitManager.cleanup(repoPath)
	} catch (error) {
		spinner.fail(chalk.red("Error"))
		console.error(chalk.red(`\n❌ ${error.message}\n`))
		process.exit(1)
	}
}

async function runReviewCommand(repoUrl) {
	const spinner = ora("Starting PR review...").start()

	try {
		// Setup
		const githubClient = new GitHubClient()
		spinner.text = "Authenticating with GitHub..."
		await githubClient.verifyAuth()

		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)
		spinner.succeed(chalk.green(`Authenticated as ${githubClient.username}`))

		console.log(chalk.blue(`\n📋 Checking PRs in: ${owner}/${repo}\n`))

		// Get open PRs
		spinner.start("Finding open pull requests...")
		const reviewManager = new ReviewManager(githubClient)
		const openPRs = await reviewManager.getOpenPRs(owner, repo)

		if (openPRs.length === 0) {
			spinner.info("No open pull requests found")
			console.log(
				chalk.yellow(
					"\n💡 Tip: Create a PR in the repository and run this command again.\n"
				)
			)
			return
		}

		spinner.succeed(`Found ${openPRs.length} open PR(s)`)

		// Review each PR
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
				console.log(chalk.yellow(`   ⏭️  Already reviewed, skipping...\n`))
				continue
			}

			// Get PR files
			const prFiles = await reviewManager.getPRFiles(owner, repo, pr.number)
			console.log(`   📁 ${prFiles.length} file(s) changed`)

			// Clone and analyze
			spinner.start(`Analyzing ${pr.head.ref} branch...`)
			const gitManager = new GitManager()
			const branchUrl = `https://github.com/${owner}/${repo}.git`
			const repoPath = await gitManager.cloneRepo(branchUrl, owner, repo)

			// Checkout PR branch
			const { default: simpleGit } = await import("simple-git")
			const git = simpleGit(repoPath)
			await git.checkout(pr.head.ref)

			// Analyze
			const sourceFiles = await gitManager.getSourceFiles(repoPath)

			const securityAnalyzer = new SecurityAnalyzer()
			const securityFindings = await securityAnalyzer.analyze(sourceFiles)

			const structureAnalyzer = new StructureAnalyzer()
			const structureFindings = await structureAnalyzer.analyze(
				repoPath,
				sourceFiles
			)

			const allFindings = [...securityFindings, ...structureFindings]

			const critical = allFindings.filter(
				(f) => f.severity === "critical"
			).length
			const warnings = allFindings.filter(
				(f) => f.severity === "warning"
			).length
			const info = allFindings.filter((f) => f.severity === "info").length

			spinner.succeed(
				`Found: ${critical} critical, ${warnings} warnings, ${info} info`
			)

			// Create review
			if (allFindings.length > 0) {
				spinner.start("Posting review...")
				await reviewManager.createReview(
					owner,
					repo,
					pr.number,
					allFindings,
					prFiles
				)
				spinner.succeed(chalk.green("Review posted!"))
			} else {
				console.log(chalk.green("   ✅ No issues found\n"))
			}

			// Cleanup
			await gitManager.cleanup(repoPath)
		}

		console.log(chalk.green.bold("\n✨ PR review complete!\n"))
	} catch (error) {
		spinner.fail(chalk.red("Error"))
		console.error(chalk.red(`\n❌ ${error.message}\n`))
		process.exit(1)
	}
}

async function runFixCommand(repoUrl) {
	const spinner = ora("Starting fix PR generation...").start()

	try {
		// Setup
		const githubClient = new GitHubClient()
		spinner.text = "Authenticating with GitHub..."
		await githubClient.verifyAuth()

		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)
		spinner.succeed(chalk.green(`Authenticated as ${githubClient.username}`))

		console.log(chalk.blue(`\n🔧 Creating fix PR for: ${owner}/${repo}\n`))

		// Clone repo
		spinner.start("Cloning repository...")
		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)
		spinner.succeed("Repository cloned")

		// Get source files
		spinner.start("Finding source files...")
		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		spinner.succeed(`Found ${sourceFiles.length} source file(s)`)

		// Run security analysis only (we only fix critical security issues)
		spinner.start("Running security analysis...")
		const securityAnalyzer = new SecurityAnalyzer()
		const securityFindings = await securityAnalyzer.analyze(sourceFiles)
		const criticalFindings = securityFindings.filter(
			(f) => f.severity === "critical"
		)
		spinner.succeed(
			`Found ${criticalFindings.length} critical security issue(s)`
		)

		if (criticalFindings.length === 0) {
			console.log(chalk.green("\n✅ No critical security issues to fix!\n"))
			await gitManager.cleanup(repoPath)
			return
		}

		// Display what will be fixed
		console.log(chalk.yellow("\n🔍 Critical issues found:"))
		criticalFindings.forEach((finding, index) => {
			console.log(`   ${index + 1}. ${finding.message} (Line ${finding.line})`)
		})
		console.log()

		// Create fix PR
		spinner.start("Creating fix PR...")
		const prManager = new PullRequestManager(githubClient)

		const pr = await prManager.createFixPR(
			owner,
			repo,
			repoPath,
			securityFindings
		)

		if (pr) {
			spinner.succeed(chalk.green("Fix PR created!"))
			console.log(chalk.blue(`\n🔗 View at: ${pr.html_url}\n`))
		} else {
			spinner.warn("Could not create fix PR")
		}

		// Cleanup
		await gitManager.cleanup(repoPath)
	} catch (error) {
		spinner.fail(chalk.red("Error"))
		console.error(chalk.red(`\n❌ ${error.message}\n`))
		process.exit(1)
	}
}

async function runAnalyzeCommand(repoUrl) {
	const spinner = ora("Starting analysis...").start()

	try {
		// Setup (no GitHub auth needed)
		const githubClient = new GitHubClient()
		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)

		console.log(chalk.blue(`\n📋 Analyzing: ${owner}/${repo}\n`))

		// Clone repo
		spinner.start("Cloning repository...")
		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)
		spinner.succeed("Repository cloned")

		// Get source files
		spinner.start("Finding source files...")
		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		spinner.succeed(`Found ${sourceFiles.length} source file(s)`)

		// Run analyses
		spinner.start("Running security analysis...")
		const securityAnalyzer = new SecurityAnalyzer()
		const securityFindings = await securityAnalyzer.analyze(sourceFiles)
		spinner.succeed("Security analysis complete")

		spinner.start("Running structure analysis...")
		const structureAnalyzer = new StructureAnalyzer()
		const structureFindings = await structureAnalyzer.analyze(
			repoPath,
			sourceFiles
		)
		spinner.succeed("Structure analysis complete")

		// Combine and display
		const allFindings = [...securityFindings, ...structureFindings]

		displaySummary(allFindings)
		displayFindings(allFindings)

		// Cleanup
		await gitManager.cleanup(repoPath)

		console.log(
			chalk.blue(
				'\n💡 Tip: Use "issue" or "review" commands to post results to GitHub.\n'
			)
		)
	} catch (error) {
		spinner.fail(chalk.red("Error"))
		console.error(chalk.red(`\n❌ ${error.message}\n`))
		process.exit(1)
	}
}

async function runCleanupCommand(repoUrl, options) {
	const spinner = ora("Starting cleanup...").start()

	try {
		// Setup
		const githubClient = new GitHubClient()
		spinner.text = "Authenticating with GitHub..."
		await githubClient.verifyAuth()

		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)
		spinner.succeed(chalk.green(`Authenticated as ${githubClient.username}`))

		console.log(
			chalk.blue(`\n🧹 Cleaning up bot branches in: ${owner}/${repo}\n`)
		)

		const prManager = new PullRequestManager(githubClient)
		const result = await prManager.cleanupAllBotBranches(owner, repo)

		// Summary
		console.log(chalk.bold("\n📊 CLEANUP SUMMARY"))
		console.log("─".repeat(50))
		console.log(chalk.green(`  Deleted: ${result.deleted} branch(es)`))
		console.log(chalk.yellow(`  Skipped: ${result.skipped} branch(es)`))

		if (result.deleted > 0) {
			console.log(chalk.green("\n✨ Cleanup complete!\n"))
		} else {
			console.log(chalk.blue("\n💡 No branches to clean up.\n"))
		}
	} catch (error) {
		spinner.fail(chalk.red("Error"))
		console.error(chalk.red(`\n❌ ${error.message}\n`))
		process.exit(1)
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function displaySummary(findings) {
	console.log(chalk.bold("\n📊 SUMMARY"))
	console.log("─".repeat(50))

	const criticalCount = findings.filter((f) => f.severity === "critical").length
	const warningCount = findings.filter((f) => f.severity === "warning").length
	const infoCount = findings.filter((f) => f.severity === "info").length

	console.log(`Total issues: ${findings.length}`)
	console.log(chalk.red(`  Critical: ${criticalCount}`))
	console.log(chalk.yellow(`  Warnings: ${warningCount}`))
	console.log(chalk.blue(`  Info: ${infoCount}`))
	console.log()
}

function displayFindings(findings) {
	const critical = findings.filter((f) => f.severity === "critical")
	const warnings = findings.filter((f) => f.severity === "warning")
	const info = findings.filter((f) => f.severity === "info")

	if (critical.length > 0) {
		console.log(chalk.red.bold("\n🚨 CRITICAL ISSUES"))
		console.log(chalk.red("─".repeat(50)))
		displayFindingsList(critical)
	}

	if (warnings.length > 0) {
		console.log(chalk.yellow.bold("\n⚠️  WARNINGS"))
		console.log(chalk.yellow("─".repeat(50)))
		displayFindingsList(warnings)
	}

	if (info.length > 0) {
		console.log(chalk.blue.bold("\n💡 SUGGESTIONS"))
		console.log(chalk.blue("─".repeat(50)))
		displayFindingsList(info)
	}
}

function displayFindingsList(findings) {
	findings.forEach((finding, index) => {
		console.log(`\n${index + 1}. ${finding.message}`)
		console.log(`   Type: ${finding.type}`)
		console.log(`   File: ${finding.file}`)
		if (finding.line !== "N/A") {
			console.log(`   Line: ${finding.line}`)
		}
		console.log(`   ${finding.description}`)
		if (finding.snippet) {
			console.log(`   Code: ${finding.snippet}`)
		}
		console.log(`   ${chalk.green("Fix:")} ${finding.recommendation}`)
	})
}
