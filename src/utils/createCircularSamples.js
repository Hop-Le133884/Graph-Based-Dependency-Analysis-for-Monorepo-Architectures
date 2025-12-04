#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import logger from '../utils/logger.js';

/**
 * Create sample projects with circular dependencies for testing
 */
async function createCircularDependencySamples() {
  const baseDir = 'sample_projects/company_A';

  // Create package A (depends on B and C)
  const projectA = {
    name: 'authService',
    version: '1.0.0',
    dependencies: {
      'userService': '^1.0.0',
      'paymentService': '^1.0.0',
      'express': '^4.18.0',  // Version 4.18
      'lodash': '^4.17.21'    // Version 4.17.21
    }
  };

  // Create package B (depends on C, creating A → B → C cycle)
  const projectB = {
    name: 'userService',
    version: '1.0.0',
    dependencies: {
      'paymentService': '^1.0.0',
      'express': '^4.17.0',  // Different express version! ⚠️
      'lodash': '^4.17.0'     // Different lodash version! ⚠️
    }
  };

  // Create package C (depends on A, completing the cycle)
  const projectC = {
    name: 'paymentService',
    version: '1.0.0',
    dependencies: {
      'authService': '^1.0.0',  // This creates the circular dependency!
      'axios': '^1.0.0',
      'express': '^4.18.2'      // Different express version! ⚠️
    }
  };

  // Create package D and E (direct circular dependency)
  const projectD = {
    name: 'sharedUtils',
    version: '1.0.0',
    dependencies: {
      'dataAnalytics': '^1.0.0',
      'lodash': '^4.16.0'  // Very different lodash version! ⚠️
    }
  };

  const projectE = {
    name: 'dataAnalytics',
    version: '1.0.0',
    dependencies: {
      'sharedUtils': '^1.0.0',  // Direct circular dependency with D
      'axios': '^0.27.0'         // Different axios version! ⚠️
    }
  };

  try {
    // Create directories and files
    const projects = [
      { name: 'authService', data: projectA },
      { name: 'userService', data: projectB },
      { name: 'paymentService', data: projectC },
      { name: 'sharedUtils', data: projectD },
      { name: 'dataAnalytics', data: projectE }
    ];

    for (const project of projects) {
      const projectPath = resolve(baseDir, project.name);
      
      if (!existsSync(projectPath)) {
        await mkdir(projectPath, { recursive: true });
      }

      const packageJsonPath = resolve(projectPath, 'package.json');
      await writeFile(packageJsonPath, JSON.stringify(project.data, null, 2));
      
      logger.success(`Created ${project.name}`);
    }

    logger.success('\n✓ Sample projects with circular dependencies created!\n');
    logger.info('Projects created:');
    logger.info('  • authService → userService → paymentService → authService (3-way cycle)');
    logger.info('  • sharedUtils ⟷ dataAnalytics (direct cycle)\n');
    logger.info('Version conflicts included:');
    logger.info('  • express: 3 different versions (^4.17.0, ^4.18.0, ^4.18.2)');
    logger.info('  • lodash: 3 different versions (^4.16.0, ^4.17.0, ^4.17.21)');
    logger.info('  • axios: 2 different versions (^0.27.0, ^1.0.0)\n');
    logger.info('Next steps:');
    logger.info('  1. Load the projects:');
    logger.info('     node src/index.js sample_projects/company_A/authService --clear');
    logger.info('     node src/index.js sample_projects/company_A/userService');
    logger.info('     node src/index.js sample_projects/company_A/paymentService');
    logger.info('     node src/index.js sample_projects/company_A/sharedUtils');
    logger.info('     node src/index.js sample_projects/company_A/dataAnalytics');
    logger.info('  2. Analyze:');
    logger.info('     node src/analysis/analyze.js --circular');
    logger.info('     node src/analysis/analyze.js --conflicts\n');

  } catch (error) {
    logger.error('Failed to create sample projects:', error.message);
    throw error;
  }
}

createCircularDependencySamples();