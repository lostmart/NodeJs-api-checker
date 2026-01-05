import { Octokit } from "@octokit/rest"
import dotenv from "dotenv"

dotenv.config()

export class GitHubClient {
	constructor() {
		if (!process.env.GITHUB_TOKEN) {
			throw new Error("GITHUB_TOKEN not found in environment variables")
		}

		this.octokit = new Octokit({
			auth: process.env.GITHUB_TOKEN,
			userAgent: "nodejs-api-checker/1.0.0",
		})

		this.username = process.env.GITHUB_USERNAME
	}

	// Test connection and verify authentication
	async verifyAuth() {
		try {
			const { data } = await this.octokit.rest.users.getAuthenticated()
			console.log(`✅ Authenticated as: ${data.login}`)
			return data
		} catch (error) {
			console.error("❌ Authentication failed:", error.message)
			throw error
		}
	}

	// Parse GitHub URL to extract owner and repo name
	parseRepoUrl(url) {
		// Handle: https://github.com/owner/repo or github.com/owner/repo
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/)
		if (!match) {
			throw new Error("Invalid GitHub URL")
		}
		return {
			owner: match[1],
			repo: match[2],
		}
	}

	// Get the Octokit instance for other modules to use
	getClient() {
		return this.octokit
	}
}
