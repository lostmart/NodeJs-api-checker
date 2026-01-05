import { GitHubClient } from "./src/github/client.js"
import { GitManager } from "./src/utils/git.js"
import { CodeParser } from "./src/utils/parser.js"
import fs from "fs-extra"

async function debug() {
	try {
		const repoUrl = "https://github.com/arnold-keyStone/node-api"

		const githubClient = new GitHubClient()
		const { owner, repo } = githubClient.parseRepoUrl(repoUrl)

		const gitManager = new GitManager()
		const repoPath = await gitManager.cloneRepo(repoUrl, owner, repo)

		const sourceFiles = await gitManager.getSourceFiles(repoPath)
		console.log(`\n📁 Found ${sourceFiles.length} source files:\n`)

		// Show each file
		for (const file of sourceFiles) {
			console.log(`File: ${file}`)

			// Read and show the content
			const content = await fs.readFile(file, "utf-8")
			console.log("\n--- File Content ---")
			console.log(content)
			console.log("\n--- End Content ---\n")

			// Try to parse it
			const parser = new CodeParser()
			const parsed = await parser.parseFile(file)

			if (parsed) {
				console.log("✅ File parsed successfully")

				// Look for db calls manually
				let foundDbCalls = false
				parser.traverseAST(parsed.ast, {
					CallExpression(path) {
						const { node } = path
						if (node.callee.type === "MemberExpression") {
							if (node.callee.object.name === "db") {
								console.log(
									`\n🔍 Found db call: db.${node.callee.property.name}()`
								)
								console.log(`   Line: ${node.loc.start.line}`)
								console.log(`   Arguments:`, node.arguments.length)
								if (node.arguments[0]) {
									console.log(`   First arg type: ${node.arguments[0].type}`)
								}
								foundDbCalls = true
							}
						}
					},
				})

				if (!foundDbCalls) {
					console.log("❌ No db calls found in AST")
				}
			} else {
				console.log("❌ Failed to parse file")
			}
		}

		await gitManager.cleanup(repoPath)
	} catch (error) {
		console.error("❌ Debug failed:", error.message)
		console.error(error)
	}
}

debug()
