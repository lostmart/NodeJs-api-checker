import simpleGit from "simple-git"
import fs from "fs-extra"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class GitManager {
	constructor() {
		// Directory where we'll clone repos temporarily
		this.cloneDir = path.join(__dirname, "../../cloned-repos")
		this.git = simpleGit()
	}

	// Ensure clone directory exists
	async ensureCloneDir() {
		await fs.ensureDir(this.cloneDir)
	}

	// Clone a repository
	async cloneRepo(repoUrl, owner, repo) {
		await this.ensureCloneDir()

		// Create a unique directory name for this repo
		const targetDir = path.join(this.cloneDir, `${owner}-${repo}`)

		// If directory exists, remove it first (fresh clone)
		if (await fs.pathExists(targetDir)) {
			console.log(`♻️  Cleaning existing clone...`)
			await fs.remove(targetDir)
		}

		console.log(`📥 Cloning ${owner}/${repo}...`)

		try {
			await this.git.clone(repoUrl, targetDir)
			console.log(`✅ Clone successful: ${targetDir}`)
			return targetDir
		} catch (error) {
			throw new Error(`Failed to clone repository: ${error.message}`)
		}
	}

	// Get all JavaScript/TypeScript files in the cloned repo
	async getSourceFiles(repoPath) {
		const files = []
		const extensions = [".js", ".mjs", ".ts"]

		// Directories to ignore
		const ignoreDirs = ["node_modules", ".git", "dist", "build", "coverage"]

		async function scan(dir) {
			const entries = await fs.readdir(dir, { withFileTypes: true })

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name)

				if (entry.isDirectory()) {
					// Skip ignored directories
					if (!ignoreDirs.includes(entry.name)) {
						await scan(fullPath)
					}
				} else if (entry.isFile()) {
					// Check if file has valid extension
					const ext = path.extname(entry.name)
					if (extensions.includes(ext)) {
						files.push(fullPath)
					}
				}
			}
		}

		await scan(repoPath)
		return files
	}

	// Clean up cloned repository
	async cleanup(repoPath) {
		if (await fs.pathExists(repoPath)) {
			await fs.remove(repoPath)
			console.log(`🧹 Cleaned up: ${repoPath}`)
		}
	}

	// Clean up all cloned repos
	async cleanupAll() {
		await this.ensureCloneDir()
		const entries = await fs.readdir(this.cloneDir)

		for (const entry of entries) {
			const fullPath = path.join(this.cloneDir, entry)
			await fs.remove(fullPath)
		}

		console.log(`🧹 Cleaned up all cloned repositories`)
	}
}
