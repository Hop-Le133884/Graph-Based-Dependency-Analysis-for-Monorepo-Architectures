import logger from '../utils/logger.js';

/**
 * Version Conflict Analyzer
 * Detects when different projects depend on different versions of the same package
 */
export class VersionConflictAnalyzer {
  constructor(client) {
    this.client = client;
  }

  /**
   * Find all version conflicts in the dependency graph
   * @returns {Promise<Array>} Array of packages with version conflicts
   */
  async findVersionConflicts() {
    logger.info('Analyzing version conflicts...');

    try {
      const query = `
        // Find packages that are depended upon by multiple projects
        MATCH (proj:Project)-[r:DEPENDS_ON]->(pkg:Package)
        WITH pkg.name as packageName, 
             collect(DISTINCT {
               project: proj.name,
               version: r.versionConstraint,
               type: r.type
             }) as dependencies
        WHERE size(dependencies) > 1
        
        // Check if there are different version constraints
        WITH packageName, dependencies,
             [dep IN dependencies | dep.version] as versions
        WHERE size(apoc.coll.toSet(versions)) > 1
        
        RETURN packageName, dependencies
        ORDER BY packageName
      `;

      const result = await this.client.executeQuery(query);

      if (result.length === 0) {
        logger.success('✓ No version conflicts found!');
        return [];
      }

      logger.warning(`⚠ Found ${result.length} packages with version conflicts`);
      return result;

    } catch (error) {
      // If apoc is not available, use simpler query
      if (error.message.includes('apoc')) {
        logger.warning('APOC plugin not detected, using basic conflict detection...');
        return await this.findVersionConflictsBasic();
      }
      logger.error('Failed to analyze version conflicts:', error.message);
      throw error;
    }
  }

  /**
   * Find version conflicts without APOC (basic version)
   * @returns {Promise<Array>} Array of packages with version conflicts
   */
  async findVersionConflictsBasic() {
    try {
      const query = `
        // Find all package dependencies
        MATCH (proj:Project)-[r:DEPENDS_ON]->(pkg:Package)
        WITH pkg.name as packageName,
             collect({
               project: proj.name,
               version: r.versionConstraint,
               type: r.type
             }) as dependencies
        WHERE size(dependencies) > 1
        RETURN packageName, dependencies
        ORDER BY packageName
      `;

      const result = await this.client.executeQuery(query);

      // Filter for actual conflicts in JavaScript
      const conflicts = result.filter(record => {
        const versions = record.dependencies.map(dep => dep.version);
        const uniqueVersions = [...new Set(versions)];
        return uniqueVersions.length > 1;
      });

      if (conflicts.length === 0) {
        logger.success('✓ No version conflicts found!');
        return [];
      }

      logger.warning(`⚠ Found ${conflicts.length} packages with version conflicts`);
      return conflicts;

    } catch (error) {
      logger.error('Failed to analyze version conflicts:', error.message);
      throw error;
    }
  }

  /**
   * Find version conflicts for a specific package
   * @param {string} packageName - Name of the package to check
   * @returns {Promise<Object|null>} Conflict details or null
   */
  async findPackageConflict(packageName) {
    logger.info(`Checking version conflicts for: ${packageName}`);

    try {
      const query = `
        MATCH (proj:Project)-[r:DEPENDS_ON]->(pkg:Package {name: $packageName})
        RETURN pkg.name as packageName,
               collect({
                 project: proj.name,
                 version: r.versionConstraint,
                 type: r.type
               }) as dependencies
      `;

      const result = await this.client.executeQuery(query, { packageName });

      if (result.length === 0) {
        logger.info(`Package "${packageName}" not found in graph`);
        return null;
      }

      const record = result[0];
      const versions = record.dependencies.map(dep => dep.version);
      const uniqueVersions = [...new Set(versions)];

      if (uniqueVersions.length === 1) {
        logger.success(`✓ No conflicts for ${packageName} - all use ${uniqueVersions[0]}`);
        return null;
      }

      logger.warning(`⚠ Version conflict found for ${packageName}`);
      return record;

    } catch (error) {
      logger.error('Failed to check package conflict:', error.message);
      throw error;
    }
  }

  /**
   * Get statistics about version conflicts
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    try {
      const query = `
        // Total unique packages
        MATCH (pkg:Package)
        WITH count(DISTINCT pkg.name) as totalPackages
        
        // Packages used by multiple projects
        MATCH (proj:Project)-[:DEPENDS_ON]->(pkg:Package)
        WITH totalPackages, pkg.name as packageName, count(proj) as usageCount
        WHERE usageCount > 1
        WITH totalPackages, count(packageName) as sharedPackages
        
        RETURN totalPackages, sharedPackages
      `;

      const result = await this.client.executeQuery(query);

      if (result.length === 0) {
        return {
          totalPackages: 0,
          sharedPackages: 0,
          conflictingPackages: 0
        };
      }

      const conflicts = await this.findVersionConflicts();

      return {
        totalPackages: result[0].totalPackages,
        sharedPackages: result[0].sharedPackages,
        conflictingPackages: conflicts.length
      };

    } catch (error) {
      logger.error('Failed to get statistics:', error.message);
      return null;
    }
  }

  /**
   * Check if two version constraints are compatible
   * @param {string} version1 - First version constraint
   * @param {string} version2 - Second version constraint
   * @returns {boolean} True if potentially compatible
   */
  isCompatible(version1, version2) {
    // Simple compatibility check
    // This is basic - could be enhanced with semver library
    
    if (version1 === version2) return true;
    
    // Extract major version
    const getMajor = (v) => {
      const match = v.match(/\d+/);
      return match ? parseInt(match[0]) : null;
    };

    const major1 = getMajor(version1);
    const major2 = getMajor(version2);

    // If both use caret (^) and same major version, likely compatible
    if (version1.startsWith('^') && version2.startsWith('^')) {
      return major1 === major2;
    }

    // If both use tilde (~) and same major.minor, likely compatible
    if (version1.startsWith('~') && version2.startsWith('~')) {
      const getMinor = (v) => {
        const match = v.match(/\d+\.(\d+)/);
        return match ? parseInt(match[1]) : null;
      };
      return major1 === major2 && getMinor(version1) === getMinor(version2);
    }

    // Different operators or exact versions - potential conflict
    return false;
  }

  /**
   * Print version conflicts report
   * @param {Array} conflicts - Array of version conflicts
   */
  printReport(conflicts) {
    if (conflicts.length === 0) {
      console.log('\n✅ No version conflicts detected!\n');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('⚠️  VERSION CONFLICT REPORT');
    console.log('='.repeat(60) + '\n');

    console.log(`Found ${conflicts.length} packages with version conflicts:\n`);

    conflicts.forEach((conflict, index) => {
      console.log(`${index + 1}. ${conflict.packageName}`);
      
      conflict.dependencies.forEach(dep => {
        const icon = dep.type === 'development' ? '🔧' : '📦';
        console.log(`   ${icon} ${dep.project}: ${dep.version} (${dep.type})`);
      });

      // Check compatibility
      const versions = conflict.dependencies.map(d => d.version);
      const allCompatible = versions.every((v1, i) => 
        versions.slice(i + 1).every(v2 => this.isCompatible(v1, v2))
      );

      if (allCompatible) {
        console.log('   ✓ Versions may be compatible (same major version)');
      } else {
        console.log('   ⚠️  Potential incompatibility - different major versions');
      }
      
      console.log('');
    });

    console.log('='.repeat(60) + '\n');
    console.log('💡 Recommendations:');
    console.log('   • Align versions across projects for consistency');
    console.log('   • Test for runtime conflicts');
    console.log('   • Consider using a shared dependency version file');
    console.log('   • Major version differences are most likely to cause issues\n');
  }

  /**
   * Print detailed conflict analysis for one package
   * @param {Object} conflict - Conflict details
   */
  printPackageConflict(conflict) {
    if (!conflict) {
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Package: ${conflict.packageName}`);
    console.log('='.repeat(60) + '\n');

    console.log('Used by:');
    conflict.dependencies.forEach(dep => {
      console.log(`  • ${dep.project}: ${dep.version} (${dep.type})`);
    });

    console.log('\nVersion Summary:');
    const versions = [...new Set(conflict.dependencies.map(d => d.version))];
    versions.forEach(version => {
      const projects = conflict.dependencies
        .filter(d => d.version === version)
        .map(d => d.project);
      console.log(`  ${version}: ${projects.join(', ')}`);
    });

    console.log('');
  }
}

export default VersionConflictAnalyzer;