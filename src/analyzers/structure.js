import path from "path"
import fs from "fs-extra"

export class StructureAnalyzer {
	constructor() {
		this.findings = []
	}

	// Analyze folder structure
	async analyze(repoPath, sourceFiles) {
		this.findings = []

		// Check for recommended folder structure
		await this.checkFolderStructure(repoPath)

		// Check for separation of concerns
		await this.checkSeparationOfConcerns(repoPath, sourceFiles)

		// Check for essential files
		await this.checkEssentialFiles(repoPath)

		// Check if it's a monolithic file
		await this.checkMonolithicStructure(sourceFiles)

		return this.findings
	}

	// Check if recommended folders exist
	async checkFolderStructure(repoPath) {
		const recommendedFolders = [
			{ name: "routes", description: "Route definitions" },
			{ name: "controllers", description: "Business logic" },
			{ name: "models", description: "Data models" },
			{ name: "middleware", description: "Custom middleware" },
			{ name: "config", description: "Configuration files" },
		]

		const missingFolders = []

		for (const folder of recommendedFolders) {
			const folderPath = path.join(repoPath, folder.name)
			const exists = await fs.pathExists(folderPath)

			if (!exists) {
				missingFolders.push(folder)
			}
		}

		if (missingFolders.length >= 3) {
			this.findings.push({
				type: "missing-folder-structure",
				severity: "warning",
				file: repoPath,
				line: "N/A",
				message: "Recommended folder structure not found",
				description: `Missing ${
					missingFolders.length
				} recommended folders: ${missingFolders.map((f) => f.name).join(", ")}`,
				recommendation: `Consider organizing your code with folders:\n${recommendedFolders
					.map((f) => `  - ${f.name}/ (${f.description})`)
					.join("\n")}`,
			})
		}
	}

	// Check if routes and controllers are separated
	async checkSeparationOfConcerns(repoPath, sourceFiles) {
		// Look for files that contain both route definitions AND database logic
		for (const filePath of sourceFiles) {
			const content = await fs.readFile(filePath, "utf-8")
			const fileName = path.basename(filePath)

			// Check if file has both Express routes and database calls
			const hasRoutes = /app\.(get|post|put|delete|patch)\(/.test(content)
			const hasDbLogic = /db\.(run|all|get|exec)\(/.test(content)

			if (hasRoutes && hasDbLogic) {
				const linesCount = content.split("\n").length

				if (linesCount > 100) {
					this.findings.push({
						type: "monolithic-file",
						severity: "warning",
						file: filePath,
						line: "N/A",
						message: "Routes and database logic in same file",
						description: `${fileName} contains both route definitions and database operations (${linesCount} lines). This violates separation of concerns.`,
						recommendation:
							"Separate into:\n  - routes/ for route definitions\n  - controllers/ for business logic\n  - models/ for database operations",
					})
				}
			}
		}
	}

	// Check for essential files
	async checkEssentialFiles(repoPath) {
		const essentialFiles = [
			{
				name: ".env.example",
				description: "Environment variables template",
				severity: "warning",
			},
			{
				name: ".gitignore",
				description: "Git ignore rules",
				severity: "warning",
			},
			{
				name: "README.md",
				description: "Project documentation",
				severity: "info",
			},
			{
				name: "package.json",
				description: "Node.js dependencies",
				severity: "critical",
			},
		]

		for (const file of essentialFiles) {
			const filePath = path.join(repoPath, file.name)
			const exists = await fs.pathExists(filePath)

			if (!exists) {
				this.findings.push({
					type: "missing-essential-file",
					severity: file.severity,
					file: repoPath,
					line: "N/A",
					message: `Missing ${file.name}`,
					description: `${file.description} not found in project root.`,
					recommendation:
						file.name === ".gitignore"
							? "Create .gitignore with:\nnode_modules/\n.env\n*.log\n.DS_Store"
							: `Create ${file.name} file`,
				})
			}
		}

		// Check if .env is committed (security issue)
		const envPath = path.join(repoPath, ".env")
		const gitignorePath = path.join(repoPath, ".gitignore")

		if (
			(await fs.pathExists(envPath)) &&
			(await fs.pathExists(gitignorePath))
		) {
			const gitignoreContent = await fs.readFile(gitignorePath, "utf-8")
			if (!gitignoreContent.includes(".env")) {
				this.findings.push({
					type: "env-not-ignored",
					severity: "critical",
					file: gitignorePath,
					line: "N/A",
					message: ".env file not in .gitignore",
					description:
						"Environment variables file exists but is not ignored by git. This can expose secrets.",
					recommendation: "Add .env to your .gitignore file",
				})
			}
		}
	}

	// Detect if entire app is in one file
	async checkMonolithicStructure(sourceFiles) {
		if (sourceFiles.length === 1) {
			const filePath = sourceFiles[0]
			const content = await fs.readFile(filePath, "utf-8")
			const linesCount = content.split("\n").length

			if (linesCount > 150) {
				this.findings.push({
					type: "single-file-app",
					severity: "warning",
					file: filePath,
					line: "N/A",
					message: "Entire application in single file",
					description: `Application is ${linesCount} lines in a single file. This makes it hard to maintain and test.`,
					recommendation:
						"Consider splitting into multiple files:\n  - app.js (main entry)\n  - routes/*.js (route definitions)\n  - controllers/*.js (business logic)\n  - models/*.js (data layer)",
				})
			}
		}
	}

	// Get findings by severity
	getBySeverity(severity) {
		return this.findings.filter((f) => f.severity === severity)
	}

	// Get summary
	getSummary() {
		return {
			total: this.findings.length,
			critical: this.getBySeverity("critical").length,
			warning: this.getBySeverity("warning").length,
			info: this.getBySeverity("info").length,
		}
	}
}
