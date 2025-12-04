// src/graph/neo4jClient.js
/**
 * Neo4j Database Client
 * Handles connection and basic operations with Neo4j database
 */

import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

class Neo4jClient {
  constructor() {
  this.uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  this.user = process.env.NEO4J_USER || 'neo4j';
  this.password = process.env.NEO4J_PASSWORD || 'password123';
  this.database = process.env.NEO4J_DATABASE || 'neo4j';
  this.driver = null;
  }

  /**
   * Connect to Neo4j database
   */
  async connect() {
    try {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password)
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      logger.success(`Connected to Neo4j at ${this.uri}`);
      return true;
    } catch (error) {
      logger.error(`Failed to connect to Neo4j: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.driver) {
      await this.driver.close();
      logger.success('Neo4j connection closed');
    }
  }

  /**
   * Execute a Cypher query
   * @param {string} query - Cypher query string
   * @param {object} parameters - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async executeQuery(query, parameters = {}) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } catch (error) {
      logger.error(`Query failed: ${error.message}`);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a write query (CREATE, MERGE, etc.)
   * @param {string} query - Cypher query string
   * @param {object} parameters - Query parameters
   * @returns {Promise<object>} Result summary
   */
  async executeWrite(query, parameters = {}) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(query, parameters);
      return result.summary;
    } catch (error) {
      logger.error(`Write query failed: ${error.message}`);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all nodes and relationships from database
   * WARNING: This deletes everything!
   */
  async clearDatabase() {
    const query = 'MATCH (n) DETACH DELETE n';
    await this.executeWrite(query);
    logger.success('Database cleared');
  }

  /**
   * Create unique constraints for better performance
   */
  async createConstraints() {
    const constraints = [
      'CREATE CONSTRAINT package_name IF NOT EXISTS FOR (p:Package) REQUIRE p.name IS UNIQUE',
      'CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE',
      'CREATE CONSTRAINT project_name IF NOT EXISTS FOR (p:Project) REQUIRE p.name IS UNIQUE'
    ];

    for (const constraint of constraints) {
      try {
        await this.executeWrite(constraint);
        logger.success('Created constraint');
      } catch (error) {
        // Constraint might already exist
        if (!error.message.toLowerCase().includes('already exists')) {
          logger.warning(`Constraint creation: ${error.message}`);
        }
      }
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<object>} Database statistics
   */
  async getStats() {
    const queries = {
      projects: 'MATCH (p:Project) RETURN count(p) as count',
      packages: 'MATCH (p:Package) RETURN count(p) as count',
      dependencies: 'MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) as count',
      files: 'MATCH (f:File) RETURN count(f) as count'
    };

    const stats = {};
    for (const [key, query] of Object.entries(queries)) {
      const result = await this.executeQuery(query);
      stats[key] = result[0]?.count?.low || result[0]?.count || 0;
    }

    return stats;
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const result = await this.executeQuery('RETURN 1 as test');
      return result[0].test === 1;
    } catch (error) {
      return false;
    }
  }
}

export default Neo4jClient;

// Test connection when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = new Neo4jClient();
  
  try {
    await client.connect();
    
    // Test query
    const isConnected = await client.testConnection();
    if (isConnected) {
      logger.success('Test query successful');
    }
    
    // Get stats
    const stats = await client.getStats();
    logger.header('Database Statistics');
    console.log(`  Projects: ${stats.projects}`);
    console.log(`  Packages: ${stats.packages}`);
    console.log(`  Dependencies: ${stats.dependencies}`);
    console.log(`  Files: ${stats.files}`);
    
    await client.close();
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    process.exit(1);
  }
}