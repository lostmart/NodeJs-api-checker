import { GitHubClient } from "./src/github/client.js"
import { GitManager } from "./src/utils/git.js"
import { SecurityAnalyzer } from "./src/analyzers/security.js"
import { StructureAnalyzer } from "./src/analyzers/structure.js"
import chalk from "chalk"

async function test() {
	try {
		const repoUrl = "https://github.com/arnold-keyStone/node-api"

		console.log(chalk.blue("🤖 Node.js API Checker\n"))

		// Step 1: Setup
		const githubClient = new GitHubClient()
		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)

		// Step 2: Clone the repo
		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)

		// Step 3: Get all source files
		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		console.log(`📁 Found ${sourceFiles.length} source files\n`)

		// Step 4: Run security analysis
		console.log(chalk.yellow("🔒 Running security analysis...\n"))
		const securityAnalyzer = new SecurityAnalyzer()
		const securityFindings = await securityAnalyzer.analyze(sourceFiles)

		// Step 5: Run structure analysis
		console.log(chalk.yellow("📁 Running structure analysis...\n"))
		const structureAnalyzer = new StructureAnalyzer()
		const structureFindings = await structureAnalyzer.analyze(
			repoPath,
			sourceFiles
		)

		// Step 6: Combine findings
		const allFindings = [...securityFindings, ...structureFindings]

		// Step 7: Display summary
		console.log(chalk.bold("\n📊 SUMMARY"))
		console.log("─".repeat(50))

		const criticalCount = allFindings.filter(
			(f) => f.severity === "critical"
		).length
		const warningCount = allFindings.filter(
			(f) => f.severity === "warning"
		).length
		const infoCount = allFindings.filter((f) => f.severity === "info").length

		console.log(`Total issues: ${allFindings.length}`)
		console.log(chalk.red(`Critical: ${criticalCount}`))
		console.log(chalk.yellow(`Warnings: ${warningCount}`))
		console.log(chalk.blue(`Info: ${infoCount}`))

		// Step 8: Display findings by severity
		if (allFindings.length > 0) {
			const critical = allFindings.filter((f) => f.severity === "critical")
			const warnings = allFindings.filter((f) => f.severity === "warning")
			const info = allFindings.filter((f) => f.severity === "info")

			if (critical.length > 0) {
				console.log(chalk.red.bold("\n\n🚨 CRITICAL ISSUES"))
				console.log(chalk.red("─".repeat(50)))
				displayFindings(critical)
			}

			if (warnings.length > 0) {
				console.log(chalk.yellow.bold("\n\n⚠️  WARNINGS"))
				console.log(chalk.yellow("─".repeat(50)))
				displayFindings(warnings)
			}

			if (info.length > 0) {
				console.log(chalk.blue.bold("\n\n💡 SUGGESTIONS"))
				console.log(chalk.blue("─".repeat(50)))
				displayFindings(info)
			}
		} else {
			console.log(chalk.green("\n✅ No issues found! Great job!"))
		}

		// Step 9: Cleanup
		await gitManager.cleanup(repoPath)
	} catch (error) {
		console.error(chalk.red("❌ Test failed:"), error.message)
	}
}

function displayFindings(findings) {
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

test()
