// src/index.js
/**
 * Dependency Analyzer - Main Application
 * Analyzes project dependencies and loads them into Neo4j
 */

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';
import Neo4jClient from './graph/neo4jClient.js';
import GraphBuilder from './graph/builder.js';
import JavaScriptParser from './parsers/javascriptParser.js';
import PythonParser from './parsers/pythonParser.js';
import logger from './utils/logger.js';

/**
 * Analyze a project and load dependencies into Neo4j
 * @param {string} projectPath - Path to project directory
 * @param {object} options - Analysis options
 */
async function analyzeProject(projectPath, options = {}) {
  logger.header('Dependency Analyzer');

  // Initialize Neo4j client
  logger.info('Connecting to Neo4j...');
  const client = new Neo4jClient();
  
  try {
    await client.connect();
  } catch (error) {
    logger.error('Failed to connect to Neo4j!');
    logger.error(`Error: ${error.message}\n`);
    logger.info('Troubleshooting:');
    console.log('1. Make sure Neo4j is running');
    console.log('2. Check your .env file has correct credentials');
    console.log('3. Verify NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD');
    process.exit(1);
  }

  try {
    // Clear database if requested
    if (options.clear) {
      logger.section('Clearing database...');
      await client.clearDatabase();
      await client.createConstraints();
    }

    // Detect project type and parse
    logger.section(`Parsing project: ${projectPath}`);
    let parsedData;
    let parser;

    if (existsSync(resolve(projectPath, 'package.json'))) {
      parser = new JavaScriptParser(projectPath);
      parsedData = await parser.parse();
    } else if (existsSync(resolve(projectPath, 'requirements.txt'))) {
      parser = new PythonParser(projectPath);
      parsedData = await parser.parse();
    } else {
      throw new Error('No package.json or requirements.txt found in project');
    }

    parser.printSummary(parsedData);

    // Build graph
    logger.section('Building dependency graph in Neo4j...');
    const builder = new GraphBuilder(client);
    await builder.buildProjectGraph(parsedData);

    // Link packages together for circular dependency detection
    await builder.linkPackageDependencies();

    // Query and display results
    logger.header('Querying Dependencies from Neo4j');
    const deps = await builder.getProjectDependencies(parsedData.projectName);
    
    console.log(`\nFound ${deps.length} dependencies:\n`);
    
    // Group by type
    const byType = {};
    deps.forEach(dep => {
      if (!byType[dep.type]) byType[dep.type] = [];
      byType[dep.type].push(dep);
    });

    // Display grouped dependencies
    Object.entries(byType).forEach(([type, typeDeps]) => {
      console.log(`  ${type.toUpperCase()}:`);
      typeDeps.forEach(dep => {
        console.log(`    - ${dep.name} ${dep.constraint}`);
      });
      console.log();
    });

    // Show dependency stats
    const stats = await builder.getDependencyStats(parsedData.projectName);
    logger.section('Dependency Statistics:');
    Object.entries(stats).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Generate visualization query
    builder.visualizeProjectGraph(parsedData.projectName);

    // Show database stats
    const dbStats = await client.getStats();
    logger.header('Database Statistics');
    console.log(`  Total Projects: ${dbStats.projects}`);
    console.log(`  Total Packages: ${dbStats.packages}`);
    console.log(`  Total Dependencies: ${dbStats.dependencies}`);
    console.log(`  Total Files: ${dbStats.files}`);

    logger.success('\nAnalysis complete!');
    console.log('\nNext steps:');
    console.log('1. Open Neo4j Browser');
    console.log('2. Copy and run the visualization query above');
    console.log('3. Explore your dependency graph!');

  } catch (error) {
    logger.error(`\nAnalysis failed: ${error.message}`);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Create a sample JavaScript project for testing
 * @returns {Promise<string>} Path to sample project
 */
async function createSampleJavaScriptProject() {
  const sampleDir = resolve('sample_projects', 'express_app');
  
  // Create directory
  await mkdir(sampleDir, { recursive: true });

  // Create sample package.json
  const packageJson = {
    name: 'express-app',
    version: '1.0.0',
    description: 'Sample Express.js application for dependency analysis',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
      dev: 'nodemon index.js',
      test: 'jest'
    },
    dependencies: {
      'express': '^4.18.2',
      'body-parser': '^1.20.2',
      'cors': '^2.8.5',
      'dotenv': '^16.3.1',
      'mongoose': '^7.4.0',
      'jsonwebtoken': '^9.0.1',
      'bcrypt': '^5.1.0',
      'axios': '^1.4.0',
      'lodash': '^4.17.21',
      'moment': '^2.29.4'
    },
    devDependencies: {
      'nodemon': '^3.0.1',
      'jest': '^29.6.1',
      'eslint': '^8.45.0',
      'prettier': '^3.0.0',
      '@types/node': '^20.4.2'
    }
  };

  const packageJsonPath = resolve(sampleDir, 'package.json');
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  logger.success(`Created sample JavaScript project at: ${sampleDir}`);
  return sampleDir;
}

/**
 * Create a sample Python project for testing
 * @returns {Promise<string>} Path to sample project
 */
async function createSamplePythonProject() {
  const sampleDir = resolve('sample_projects', 'flask_app');
  
  // Create directory
  await mkdir(sampleDir, { recursive: true });

  // Create sample requirements.txt
  const requirements = `# Web Framework
flask==2.3.0
werkzeug==2.3.0

# Database
sqlalchemy==2.0.15
psycopg2-binary==2.9.6

# Utilities
requests>=2.28.0
python-dotenv==1.0.0
click>=8.1.0

# Testing
pytest>=7.3.0
pytest-cov>=4.1.0

# Data Processing
pandas==2.0.2
numpy>=1.24.0

# API
flask-restful==0.3.10
flask-cors==4.0.0
`;

  const requirementsPath = resolve(sampleDir, 'requirements.txt');
  await writeFile(requirementsPath, requirements);

  logger.success(`Created sample Python project at: ${sampleDir}`);
  return sampleDir;
}

/**
 * Parse command line arguments
 * @returns {object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    projectPath: null,
    clear: false,
    sampleJs: false,
    samplePy: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--clear') {
      options.clear = true;
    } else if (arg === '--sample' || arg === '--sample-js') {
      options.sampleJs = true;
    } else if (arg === '--sample-py') {
      options.samplePy = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('--')) {
      options.projectPath = arg;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Dependency Analyzer - Graph-based dependency analysis tool

Usage: node src/index.js [path] [options]

Arguments:
  path              Path to project directory

Options:
  --clear           Clear database before loading
  --sample          Create and analyze sample JavaScript project
  --sample-js       Create and analyze sample JavaScript project
  --sample-py       Create and analyze sample Python project
  --help, -h        Show this help message

Examples:
  node src/index.js /path/to/project
  node src/index.js /path/to/project --clear
  node src/index.js --sample
  node src/index.js --sample-py --clear

NPM Scripts:
  npm start         Run analyzer on current directory
  npm test          Create and analyze sample project
  `);
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    let projectPath;

    // Handle sample projects
    if (options.sampleJs) {
      projectPath = await createSampleJavaScriptProject();
    } else if (options.samplePy) {
      projectPath = await createSamplePythonProject();
    } else if (options.projectPath) {
      projectPath = options.projectPath;
    } else {
      printHelp();
      process.exit(1);
    }

    // Analyze project
    await analyzeProject(projectPath, { clear: options.clear });

  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.error(`Project path not found: ${error.path}`);
    } else {
      logger.error(`Unexpected error: ${error.message}`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});