// src/parsers/javascriptParser.js
/**
 * JavaScript Parser
 * Parses package.json files to extract dependencies
 */

import { readFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger.js';

class JavaScriptParser {
  constructor(projectPath) {
    this.projectPath = resolve(projectPath);
    this.projectName = basename(this.projectPath);
  }

  /**
   * Parse JavaScript project dependencies
   * @returns {Promise<object>} Parsed project information with dependencies
   */
  async parse() {
    const packageJsonPath = resolve(this.projectPath, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      throw new Error(`No package.json found in ${this.projectPath}`);
    }

    return await this._parsePackageJson(packageJsonPath);
  }

  /**
   * Parse package.json file
   * @param {string} filePath - Path to package.json
   * @returns {Promise<object>} Parsed project information
   */
  async _parsePackageJson(filePath) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Extract dependencies
      const dependencies = this._extractDependencies(
        packageJson.dependencies || {},
        'production'
      );

      const devDependencies = this._extractDependencies(
        packageJson.devDependencies || {},
        'development'
      );

      const peerDependencies = this._extractDependencies(
        packageJson.peerDependencies || {},
        'peer'
      );

      const allDependencies = [
        ...dependencies,
        ...devDependencies,
        ...peerDependencies
      ];

      return {
        projectName: packageJson.name || this.projectName,
        projectPath: this.projectPath,
        language: 'javascript',
        version: packageJson.version || '1.0.0',
        description: packageJson.description || '',
        dependencyFile: filePath,
        dependencies: allDependencies,
        totalDependencies: allDependencies.length,
        stats: {
          production: dependencies.length,
          development: devDependencies.length,
          peer: peerDependencies.length
        }
      };
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${error.message}`);
    }
  }

  /**
   * Extract dependencies from package.json section
   * @param {object} deps - Dependencies object from package.json
   * @param {string} type - Type of dependency (production, development, peer)
   * @returns {Array<object>} Array of dependency objects
   */
  _extractDependencies(deps, type) {
    return Object.entries(deps).map(([name, version]) => {
      const parsed = this._parseVersion(version);
      return {
        name,
        version: parsed.version,
        versionRange: version,
        operator: parsed.operator,
        type,
        raw: `${name}@${version}`
      };
    });
  }

  /**
   * Parse version string to extract operator and version
   * @param {string} versionStr - Version string (e.g., "^1.0.0", ">=2.0.0")
   * @returns {object} Parsed version information
   */
  _parseVersion(versionStr) {
    // Handle special cases
    if (versionStr === '*' || versionStr === 'latest') {
      return { version: 'latest', operator: '' };
    }

    // GitHub URLs or git repos
    if (versionStr.includes('git') || versionStr.includes('github')) {
      return { version: versionStr, operator: 'git' };
    }

    // File paths
    if (versionStr.startsWith('file:')) {
      return { version: versionStr, operator: 'file' };
    }

    // Standard semver patterns
    const patterns = [
      { regex: /^\^(.+)$/, operator: '^' },      // ^1.0.0
      { regex: /^~(.+)$/, operator: '~' },       // ~1.0.0
      { regex: /^>=(.+)$/, operator: '>=' },     // >=1.0.0
      { regex: /^<=(.+)$/, operator: '<=' },     // <=1.0.0
      { regex: /^>(.+)$/, operator: '>' },       // >1.0.0
      { regex: /^<(.+)$/, operator: '<' },       // <1.0.0
      { regex: /^=(.+)$/, operator: '=' },       // =1.0.0
      { regex: /^(.+)$/, operator: '' }          // 1.0.0 (exact)
    ];

    for (const { regex, operator } of patterns) {
      const match = versionStr.match(regex);
      if (match) {
        return { version: match[1], operator };
      }
    }

    return { version: versionStr, operator: '' };
  }

  /**
   * Print a summary of parsed dependencies
   * @param {object} parsedData - Parsed project data
   */
  printSummary(parsedData) {
    logger.header('Project Summary');
    console.log(`Project: ${parsedData.projectName}`);
    console.log(`Version: ${parsedData.version}`);
    console.log(`Language: ${parsedData.language}`);
    console.log(`Path: ${parsedData.projectPath}`);
    console.log(`Dependency File: ${parsedData.dependencyFile}`);
    console.log(`\nTotal Dependencies: ${parsedData.totalDependencies}`);
    console.log(`  - Production: ${parsedData.stats.production}`);
    console.log(`  - Development: ${parsedData.stats.development}`);
    console.log(`  - Peer: ${parsedData.stats.peer}`);

    logger.section('\nDependencies:');
    
    // Group by type
    const byType = {
      production: [],
      development: [],
      peer: []
    };

    parsedData.dependencies.forEach(dep => {
      byType[dep.type].push(dep);
    });

    // Print production dependencies
    if (byType.production.length > 0) {
      console.log('\n  Production:');
      byType.production.forEach(dep => {
        console.log(`    - ${dep.name} ${dep.versionRange}`);
      });
    }

    // Print dev dependencies
    if (byType.development.length > 0) {
      console.log('\n  Development:');
      byType.development.forEach(dep => {
        console.log(`    - ${dep.name} ${dep.versionRange}`);
      });
    }

    // Print peer dependencies
    if (byType.peer.length > 0) {
      console.log('\n  Peer:');
      byType.peer.forEach(dep => {
        console.log(`    - ${dep.name} ${dep.versionRange}`);
      });
    }
    console.log();
  }
}

export default JavaScriptParser;

// Test the parser when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();
  
  logger.header('JavaScript Parser Test');
  logger.info(`Parsing project: ${projectPath}`);
  
  const parser = new JavaScriptParser(projectPath);
  
  try {
    const parsedData = await parser.parse();
    parser.printSummary(parsedData);
  } catch (error) {
    logger.error(`Parse failed: ${error.message}`);
    process.exit(1);
  }
}