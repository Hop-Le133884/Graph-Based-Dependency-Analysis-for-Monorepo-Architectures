// src/parsers/pythonParser.js
/**
 * Python Parser
 * Parses requirements.txt files to extract dependencies
 */

import { readFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger.js';

class PythonParser {
  constructor(projectPath) {
    this.projectPath = resolve(projectPath);
    this.projectName = basename(this.projectPath);
  }

  /**
   * Parse Python project dependencies
   * @returns {Promise<object>} Parsed project information with dependencies
   */
  async parse() {
    const requirementsPath = resolve(this.projectPath, 'requirements.txt');
    
    if (!existsSync(requirementsPath)) {
      throw new Error(`No requirements.txt found in ${this.projectPath}`);
    }

    return await this._parseRequirementsTxt(requirementsPath);
  }

  /**
   * Parse requirements.txt file
   * @param {string} filePath - Path to requirements.txt
   * @returns {Promise<object>} Parsed project information
   */
  async _parseRequirementsTxt(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const dependencies = [];
      let lineNumber = 0;

      for (const line of lines) {
        lineNumber++;
        
        // Remove comments and whitespace
        const cleanLine = line.split('#')[0].trim();
        
        // Skip empty lines and pip options
        if (!cleanLine || cleanLine.startsWith('-')) {
          continue;
        }

        // Parse requirement line
        const depInfo = this._parseRequirementLine(cleanLine, lineNumber);
        if (depInfo) {
          dependencies.push(depInfo);
        }
      }

      return {
        projectName: this.projectName,
        projectPath: this.projectPath,
        language: 'python',
        dependencyFile: filePath,
        dependencies,
        totalDependencies: dependencies.length
      };
    } catch (error) {
      throw new Error(`Failed to parse requirements.txt: ${error.message}`);
    }
  }

  /**
   * Parse a single requirement line
   * Pattern: package_name[extras]operator version
   * Examples: requests==2.28.0, numpy>=1.20.0, flask[async]>=2.0
   * 
   * @param {string} line - Requirement line
   * @param {number} lineNumber - Line number for error reporting
   * @returns {object|null} Parsed dependency information
   */
  _parseRequirementLine(line, lineNumber) {
    // Pattern: package_name[extras]operator version
    const pattern = /^([a-zA-Z0-9_\-\.]+)(\[[\w,]+\])?(==|>=|<=|>|<|~=)?(.+)?$/;
    const match = line.match(pattern);

    if (!match) {
      logger.warning(`Could not parse line ${lineNumber}: ${line}`);
      return null;
    }

    const [, name, extras = '', operator = '', version = ''] = match;

    return {
      name,
      version: version.trim() || 'latest',
      versionRange: operator + version.trim(),
      operator,
      extras,
      type: 'production',
      lineNumber,
      raw: line
    };
  }

  /**
   * Print a summary of parsed dependencies
   * @param {object} parsedData - Parsed project data
   */
  printSummary(parsedData) {
    logger.header('Project Summary');
    console.log(`Project: ${parsedData.projectName}`);
    console.log(`Language: ${parsedData.language}`);
    console.log(`Path: ${parsedData.projectPath}`);
    console.log(`Dependency File: ${parsedData.dependencyFile}`);
    console.log(`Total Dependencies: ${parsedData.totalDependencies}`);

    logger.section('\nDependencies:');
    parsedData.dependencies.forEach(dep => {
      const versionStr = dep.operator ? 
        `${dep.operator}${dep.version}` : 
        dep.version;
      console.log(`  - ${dep.name} ${versionStr}${dep.extras}`);
    });
    console.log();
  }
}

export default PythonParser;

// Test the parser when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();
  
  logger.header('Python Parser Test');
  logger.info(`Parsing project: ${projectPath}`);
  
  const parser = new PythonParser(projectPath);
  
  try {
    const parsedData = await parser.parse();
    parser.printSummary(parsedData);
  } catch (error) {
    logger.error(`Parse failed: ${error.message}`);
    process.exit(1);
  }
}