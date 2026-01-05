import { CodeParser } from "../utils/parser.js"

export class SecurityAnalyzer {
	constructor() {
		this.parser = new CodeParser()
		this.findings = []
	}

	// Analyze files for security issues
	async analyze(filePaths) {
		this.findings = []
		const parsedFiles = await this.parser.parseFiles(filePaths)

		for (const { ast, code, filePath } of parsedFiles) {
			this.checkSQLInjection(ast, code, filePath)
			this.checkSecretsInCode(ast, code, filePath)
		}

		return this.findings
	}

	// Check for SQL injection vulnerabilities
	checkSQLInjection(ast, code, filePath) {
		const self = this

		this.parser.traverseAST(ast, {
			// Look for db.run(), db.all(), db.get(), etc.
			CallExpression(path) {
				const { node } = path
				const callee = node.callee

				// Check if it's a database call
				if (
					callee.type === "MemberExpression" &&
					callee.object.name === "db" &&
					["run", "all", "get", "exec"].includes(callee.property.name)
				) {
					// Get the first argument (the SQL query)
					const queryArg = node.arguments[0]

					if (!queryArg) return

					// Check for string concatenation or template literals with variables
					const isUnsafe =
						queryArg.type === "BinaryExpression" || // "SELECT * FROM " + table
						(queryArg.type === "TemplateLiteral" &&
							queryArg.expressions.length > 0) // `SELECT * FROM ${table}`

					if (isUnsafe) {
						const line = self.parser.getLineNumber(node)
						const snippet = self.parser.getCodeSnippet(code, line, line + 2)

						self.findings.push({
							type: "sql-injection",
							severity: "critical",
							file: filePath,
							line: line,
							message: "SQL Injection vulnerability detected",
							description:
								"Query uses string concatenation or template literals with user input. Use parameterized queries instead.",
							snippet: snippet,
							recommendation:
								'Use parameterized queries with ? placeholders:\ndb.run("SELECT * FROM users WHERE id = ?", [userId], callback)',
						})
					}
				}
			},
		})
	}

	// Check for exposed secrets (API keys, tokens, passwords)
	checkSecretsInCode(ast, code, filePath) {
		const self = this
		const secretPatterns = [
			{
				name: "API Key",
				pattern: /['"](sk_live_|pk_live_|api_key_)[a-zA-Z0-9]{20,}['"]/,
			},
			{ name: "AWS Key", pattern: /['"]AKIA[0-9A-Z]{16}['"]/ },
			{
				name: "Generic Secret",
				pattern: /(password|secret|token|api_key)\s*[:=]\s*['"]\w{10,}['"]/,
			},
		]

		const lines = code.split("\n")

		lines.forEach((line, index) => {
			secretPatterns.forEach(({ name, pattern }) => {
				if (pattern.test(line)) {
					self.findings.push({
						type: "exposed-secret",
						severity: "critical",
						file: filePath,
						line: index + 1,
						message: `Potential ${name} found in code`,
						description:
							"Hardcoded secrets should never be committed to version control.",
						snippet: line.trim(),
						recommendation:
							"Move secrets to environment variables (.env file) and use process.env.SECRET_NAME",
					})
				}
			})
		})
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
