import logger from '../utils/logger.js';

/**
 * Circular Dependency Analyzer
 * Detects cycles in the dependency graph using Neo4j's graph algorithms
 */
export class CircularDependencyAnalyzer {
  constructor(client) {
    this.client = client;
  }

  /**
   * Find all circular dependencies in the graph
   * @returns {Promise<Array>} Array of circular dependency chains
   */
  async findCircularDependencies() {
    logger.info('Analyzing circular dependencies...');

    try {
      // Query to find cycles of any length
      const query = `
        MATCH path = (p1:Package)-[:DEPENDS_ON*]->(p1)
        WHERE length(path) > 1
        WITH path, 
             [node in nodes(path) | node.name] as packageNames,
             length(path) as cycleLength
        RETURN DISTINCT packageNames, cycleLength
        ORDER BY cycleLength ASC
        LIMIT 100
      `;

      const result = await this.client.executeQuery(query);

      const cycles = result.map(record => ({
        packages: record.packageNames,
        length: record.cycleLength
      }));

      if (cycles.length === 0) {
        logger.success('✓ No circular dependencies found!');
        return [];
      }

      logger.warning(`⚠ Found ${cycles.length} circular dependencies`);
      return cycles;

    } catch (error) {
      logger.error('Failed to analyze circular dependencies:', error.message);
      throw error;
    }
  }

  /**
   * Find direct circular dependencies (A -> B -> A)
   * @returns {Promise<Array>} Array of direct circular dependencies
   */
  async findDirectCircularDependencies() {
    logger.info('Analyzing direct circular dependencies (2-node cycles)...');

    try {
      const query = `
        MATCH (p1:Package)-[:DEPENDS_ON]->(p2:Package)-[:DEPENDS_ON]->(p1)
        WHERE p1.name < p2.name
        RETURN p1.name as package1, p2.name as package2
      `;

      const result = await this.client.executeQuery(query);

      const cycles = result.map(record => ({
        package1: record.package1,
        package2: record.package2
      }));

      if (cycles.length === 0) {
        logger.success('✓ No direct circular dependencies found!');
      } else {
        logger.warning(`⚠ Found ${cycles.length} direct circular dependencies`);
      }

      return cycles;

    } catch (error) {
      logger.error('Failed to analyze direct circular dependencies:', error.message);
      throw error;
    }
  }

  /**
   * Find circular dependencies within a specific project
   * @param {string} projectName - Name of the project to analyze
   * @returns {Promise<Array>} Array of circular dependencies
   */
  async findProjectCircularDependencies(projectName) {
    logger.info(`Analyzing circular dependencies for project: ${projectName}`);

    try {
      const query = `
        MATCH (proj:Project {name: $projectName})-[:DEPENDS_ON]->(p1:Package)
        MATCH path = (p1)-[:DEPENDS_ON*]->(p1)
        WHERE length(path) > 1
        WITH path,
             [node in nodes(path) | node.name] as packageNames,
             length(path) as cycleLength
        RETURN DISTINCT packageNames, cycleLength
        ORDER BY cycleLength ASC
        LIMIT 50
      `;

      const result = await this.client.executeQuery(query, { projectName });

      const cycles = result.map(record => ({
        packages: record.packageNames,
        length: record.cycleLength
      }));

      if (cycles.length === 0) {
        logger.success(`✓ No circular dependencies found in ${projectName}`);
      } else {
        logger.warning(`⚠ Found ${cycles.length} circular dependencies in ${projectName}`);
      }

      return cycles;

    } catch (error) {
      logger.error('Failed to analyze project circular dependencies:', error.message);
      throw error;
    }
  }

  /**
   * Print circular dependencies report
   * @param {Array} cycles - Array of circular dependency cycles
   */
  printReport(cycles) {
    if (cycles.length === 0) {
      console.log('\n✅ No circular dependencies detected!\n');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('⚠️  CIRCULAR DEPENDENCY REPORT');
    console.log('='.repeat(60) + '\n');

    console.log(`Found ${cycles.length} circular dependencies:\n`);

    cycles.forEach((cycle, index) => {
      console.log(`${index + 1}. Cycle of length ${cycle.length}:`);
      console.log(`   ${cycle.packages.join(' → ')}`);
      console.log('');
    });

    console.log('='.repeat(60) + '\n');
    console.log('💡 Tip: Circular dependencies can cause:');
    console.log('   - Build failures');
    console.log('   - Installation issues');
    console.log('   - Runtime errors');
    console.log('   - Difficulty in testing and maintenance\n');
  }

  /**
   * Get statistics about circular dependencies
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    try {
      const query = `
        MATCH path = (p:Package)-[:DEPENDS_ON*]->(p)
        WHERE length(path) > 1
        WITH path, length(path) as cycleLength
        RETURN 
          count(DISTINCT path) as totalCycles,
          min(cycleLength) as shortestCycle,
          max(cycleLength) as longestCycle,
          avg(cycleLength) as avgCycleLength
      `;

      const result = await this.client.executeQuery(query);

      if (result.length === 0 || result[0].totalCycles === 0) {
        return {
          totalCycles: 0,
          shortestCycle: 0,
          longestCycle: 0,
          avgCycleLength: 0
        };
      }

      const record = result[0];
      return {
        totalCycles: record.totalCycles,
        shortestCycle: record.shortestCycle,
        longestCycle: record.longestCycle,
        avgCycleLength: parseFloat(record.avgCycleLength?.toFixed(2) || 0)
      };

    } catch (error) {
      logger.error('Failed to get statistics:', error.message);
      return null;
    }
  }
}

export default CircularDependencyAnalyzer;