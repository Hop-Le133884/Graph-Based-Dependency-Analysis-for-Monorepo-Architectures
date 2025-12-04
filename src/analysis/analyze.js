#!/usr/bin/env node

import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import Neo4jClient from '../graph/neo4jClient.js';
import CircularDependencyAnalyzer from './circularDependencies.js';
import VersionConflictAnalyzer from './versionConflicts.js';

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);

function printHelp() {
  console.log(`
Usage: node src/analysis/analyze.js [options]

Circular Dependencies:
  --circular                Find all circular dependencies
  --circular-direct         Find direct circular dependencies only (A → B → A)
  --circular-stats          Show circular dependency statistics
  --project <name>          Analyze circular dependencies for a specific project

Version Conflicts:
  --conflicts               Find all version conflicts
  --conflict-stats          Show version conflict statistics
  --package <name>          Check version conflicts for specific package

General:
  --help, -h                Show this help message

Examples:
  # Circular dependencies
  node src/analysis/analyze.js --circular
  node src/analysis/analyze.js --circular-direct
  node src/analysis/analyze.js --circular-stats
  node src/analysis/analyze.js --project authService
  
  # Version conflicts
  node src/analysis/analyze.js --conflicts
  node src/analysis/analyze.js --conflict-stats
  node src/analysis/analyze.js --package express
  `);
}

async function main() {
  // Check for help flag
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Connect to Neo4j using the client
  const client = new Neo4jClient();

  try {
    logger.info('Connecting to Neo4j...');
    await client.connect();
    
    const circularAnalyzer = new CircularDependencyAnalyzer(client);
    const conflictAnalyzer = new VersionConflictAnalyzer(client);

    // ============ CIRCULAR DEPENDENCY ANALYSIS ============
    
    if (args.includes('--circular-stats')) {
      // Show circular dependency statistics
      const stats = await circularAnalyzer.getStatistics();
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 CIRCULAR DEPENDENCY STATISTICS');
      console.log('='.repeat(60) + '\n');
      
      if (stats.totalCycles === 0) {
        console.log('✅ No circular dependencies found!\n');
      } else {
        console.log(`Total Cycles: ${stats.totalCycles}`);
        console.log(`Shortest Cycle: ${stats.shortestCycle} packages`);
        console.log(`Longest Cycle: ${stats.longestCycle} packages`);
        console.log(`Average Cycle Length: ${stats.avgCycleLength} packages\n`);
      }

    } else if (args.includes('--circular-direct')) {
      // Find direct circular dependencies
      const cycles = await circularAnalyzer.findDirectCircularDependencies();
      
      if (cycles.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('⚠️  DIRECT CIRCULAR DEPENDENCIES');
        console.log('='.repeat(60) + '\n');
        
        cycles.forEach((cycle, index) => {
          console.log(`${index + 1}. ${cycle.package1} ⟷ ${cycle.package2}`);
        });
        console.log('');
      }

    } else if (args.includes('--project')) {
      // Analyze specific project
      const projectIndex = args.indexOf('--project');
      const projectName = args[projectIndex + 1];
      
      if (!projectName) {
        logger.error('Please provide a project name');
        process.exit(1);
      }

      const cycles = await circularAnalyzer.findProjectCircularDependencies(projectName);
      circularAnalyzer.printReport(cycles);

    } else if (args.includes('--circular')) {
      // Find all circular dependencies
      const cycles = await circularAnalyzer.findCircularDependencies();
      circularAnalyzer.printReport(cycles);

      // Show statistics too
      if (cycles.length > 0) {
        const stats = await circularAnalyzer.getStatistics();
        console.log('📊 Statistics:');
        console.log(`   Total Cycles: ${stats.totalCycles}`);
        console.log(`   Shortest: ${stats.shortestCycle} packages`);
        console.log(`   Longest: ${stats.longestCycle} packages`);
        console.log(`   Average: ${stats.avgCycleLength} packages\n`);
      }

    // ============ VERSION CONFLICT ANALYSIS ============
    
    } else if (args.includes('--conflicts')) {
      // Find all version conflicts
      const conflicts = await conflictAnalyzer.findVersionConflicts();
      conflictAnalyzer.printReport(conflicts);

      // Show statistics too
      if (conflicts.length > 0) {
        const stats = await conflictAnalyzer.getStatistics();
        console.log('📊 Statistics:');
        console.log(`   Total Packages: ${stats.totalPackages}`);
        console.log(`   Shared Packages: ${stats.sharedPackages}`);
        console.log(`   Conflicting Packages: ${stats.conflictingPackages}\n`);
      }

    } else if (args.includes('--conflict-stats')) {
      // Show version conflict statistics
      const stats = await conflictAnalyzer.getStatistics();
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 VERSION CONFLICT STATISTICS');
      console.log('='.repeat(60) + '\n');
      
      console.log(`Total Packages: ${stats.totalPackages}`);
      console.log(`Shared Packages: ${stats.sharedPackages} (used by multiple projects)`);
      console.log(`Conflicting Packages: ${stats.conflictingPackages} (different versions)\n`);
      
      if (stats.conflictingPackages === 0) {
        console.log('✅ No version conflicts found!\n');
      } else {
        const conflicting = Number(stats.conflictingPackages);
        const shared = Number(stats.sharedPackages);
        const conflictRate = ((conflicting / shared) * 100).toFixed(1);
        console.log(`Conflict Rate: ${conflictRate}% of shared packages have version conflicts\n`);
      }

    } else if (args.includes('--package')) {
      // Check specific package for conflicts
      const packageIndex = args.indexOf('--package');
      const packageName = args[packageIndex + 1];
      
      if (!packageName) {
        logger.error('Please provide a package name');
        process.exit(1);
      }

      const conflict = await conflictAnalyzer.findPackageConflict(packageName);
      if (conflict) {
        conflictAnalyzer.printPackageConflict(conflict);
      }

    } else {
      logger.error('Unknown option. Use --help for usage information');
      process.exit(1);
    }

  } catch (error) {
    logger.error('Analysis failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();