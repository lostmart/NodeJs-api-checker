import { parse } from "@babel/parser"
import traverse from "@babel/traverse"
import fs from "fs-extra"

export class CodeParser {
	constructor() {
		this.parserOptions = {
			sourceType: "module",
			plugins: [
				"jsx",
				"typescript",
				"decorators-legacy",
				"classProperties",
				"dynamicImport",
			],
		}
	}

	// Parse a JavaScript file into an AST
	async parseFile(filePath) {
		try {
			const code = await fs.readFile(filePath, "utf-8")
			const ast = parse(code, this.parserOptions)
			return { ast, code, filePath }
		} catch (error) {
			console.warn(`⚠️  Could not parse ${filePath}: ${error.message}`)
			return null
		}
	}

	// Parse multiple files
	async parseFiles(filePaths) {
		const results = []

		for (const filePath of filePaths) {
			const result = await this.parseFile(filePath)
			if (result) {
				results.push(result)
			}
		}

		return results
	}

	// Traverse an AST with visitor functions
	traverseAST(ast, visitors) {
		traverse.default(ast, visitors)
	}

	// Helper: Get line number from a node
	getLineNumber(node) {
		return node.loc ? node.loc.start.line : "unknown"
	}

	// Helper: Get code snippet from source
	getCodeSnippet(code, startLine, endLine) {
		const lines = code.split("\n")
		return lines.slice(startLine - 1, endLine).join("\n")
	}
}
