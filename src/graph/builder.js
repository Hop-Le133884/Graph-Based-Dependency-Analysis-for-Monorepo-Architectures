// src/graph/builder.js
/**
 * Graph Builder
 * Converts parsed dependency data into Neo4j graph structure
 */

import logger from '../utils/logger.js';

class GraphBuilder {
  constructor(neo4jClient) {
    this.client = neo4jClient;
  }

  /**
   * Build complete project graph in Neo4j
   * @param {object} parsedData - Parsed project data from parser
   * @returns {Promise<boolean>} Success status
   */
  async buildProjectGraph(parsedData) {
    logger.section(`Building graph for project: ${parsedData.projectName}`);

    try {
      // Step 1: Create project node
      await this._createProjectNode(parsedData);
      logger.success(`Created project node: ${parsedData.projectName}`);

      // Step 2: Create package nodes and relationships
      const packagesCreated = await this._createDependencyNodes(
        parsedData.projectName,
        parsedData.dependencies
      );
      logger.success(`Created ${packagesCreated} package nodes`);

      // Step 3: Create file node for dependency file
      await this._createFileNode(parsedData);
      logger.success('Created file node');

      logger.success('Graph built successfully!');
      return true;
    } catch (error) {
      logger.error(`Failed to build graph: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create or merge project node
   * @param {object} parsedData - Parsed project data
   * @returns {Promise<object>} Created/merged project node
   */
  async _createProjectNode(parsedData) {
    const query = `
      MERGE (p:Project {name: $name})
      SET p.path = $path,
          p.language = $language,
          p.version = $version,
          p.description = $description,
          p.totalDependencies = $totalDeps,
          p.updatedAt = datetime()
      RETURN p
    `;

    const parameters = {
      name: parsedData.projectName,
      path: parsedData.projectPath,
      language: parsedData.language,
      version: parsedData.version || '1.0.0',
      description: parsedData.description || '',
      totalDeps: parsedData.totalDependencies
    };

    const result = await this.client.executeQuery(query, parameters);
    return result[0];
  }

  /**
   * Create package nodes and DEPENDS_ON relationships
   * @param {string} projectName - Name of the project
   * @param {Array} dependencies - List of dependency objects
   * @returns {Promise<number>} Number of packages created
   */
  async _createDependencyNodes(projectName, dependencies) {
    let packagesCreated = 0;

    for (const dep of dependencies) {
      // Create package node
      const packageQuery = `
        MERGE (pkg:Package {name: $name})
        SET pkg.version = $version,
            pkg.operator = $operator,
            pkg.language = $language,
            pkg.updatedAt = datetime()
        RETURN pkg
      `;

      const packageParams = {
        name: dep.name,
        version: dep.version,
        operator: dep.operator || '',
        language: dep.language || 'javascript'
      };

      await this.client.executeQuery(packageQuery, packageParams);

      // Create relationship from project to package
      const relationshipQuery = `
        MATCH (proj:Project {name: $projectName})
        MATCH (pkg:Package {name: $packageName})
        MERGE (proj)-[r:DEPENDS_ON]->(pkg)
        SET r.versionConstraint = $versionConstraint,
            r.type = $type,
            r.direct = true,
            r.lineNumber = $lineNumber,
            r.updatedAt = datetime()
        RETURN r
      `;

      const relParams = {
        projectName,
        packageName: dep.name,
        versionConstraint: dep.versionRange || dep.version,
        type: dep.type || 'production',
        lineNumber: dep.lineNumber || 0
      };

      await this.client.executeQuery(relationshipQuery, relParams);
      packagesCreated++;
    }

    return packagesCreated;
  }

  /**
   * Create file node for dependency file
   * @param {object} parsedData - Parsed project data
   * @returns {Promise<object>} Created file node
   */
  async _createFileNode(parsedData) {
    const query = `
      MATCH (proj:Project {name: $projectName})
      MERGE (f:File {path: $filePath})
      SET f.name = $fileName,
          f.type = $fileType,
          f.language = $language,
          f.updatedAt = datetime()
      MERGE (proj)-[:HAS_FILE]->(f)
      RETURN f
    `;

    const fileName = parsedData.dependencyFile.split('/').pop();

    const parameters = {
      projectName: parsedData.projectName,
      filePath: parsedData.dependencyFile,
      fileName,
      fileType: 'dependency_manifest',
      language: parsedData.language
    };

    const result = await this.client.executeQuery(query, parameters);
    return result[0];
  }

  /**
   * Retrieve all dependencies for a project
   * @param {string} projectName - Name of the project
   * @returns {Promise<Array>} List of dependencies
   */
  async getProjectDependencies(projectName) {
    const query = `
      MATCH (proj:Project {name: $projectName})-[r:DEPENDS_ON]->(pkg:Package)
      RETURN pkg.name as name,
             pkg.version as version,
             r.versionConstraint as constraint,
             r.type as type,
             r.lineNumber as lineNumber
      ORDER BY pkg.name
    `;

    return await this.client.executeQuery(query, { projectName });
  }

  /**
   * Find packages that are used by multiple projects
   * @returns {Promise<Array>} Packages with their usage count
   */
  async findSharedDependencies() {
    const query = `
      MATCH (proj:Project)-[:DEPENDS_ON]->(pkg:Package)
      WITH pkg, count(proj) as usageCount, collect(proj.name) as projects
      WHERE usageCount > 1
      RETURN pkg.name as package,
             pkg.version as version,
             usageCount,
             projects
      ORDER BY usageCount DESC
    `;

    return await this.client.executeQuery(query);
  }

  /**
   * Get dependency statistics by type
   * @param {string} projectName - Name of the project
   * @returns {Promise<object>} Dependency statistics
   */
  async getDependencyStats(projectName) {
    const query = `
      MATCH (proj:Project {name: $projectName})-[r:DEPENDS_ON]->(pkg:Package)
      RETURN r.type as type, count(pkg) as count
      ORDER BY type
    `;

    const results = await this.client.executeQuery(query, { projectName });
    
    const stats = {};
    results.forEach(row => {
      stats[row.type] = row.count;
    });

    return stats;
  }

  /**
   * Generate visualization query for Neo4j Browser
   * @param {string} projectName - Name of the project
   * @returns {string} Cypher query for visualization
   */
  visualizeProjectGraph(projectName) {
    const query = `MATCH path = (proj:Project {name: '${projectName}'})-[:DEPENDS_ON]->(pkg:Package)
RETURN path
LIMIT 50`;

    logger.header('Visualization Query');
    console.log('To visualize in Neo4j Browser, copy and run this query:\n');
    console.log(query);
    console.log();

    return query;
  }

  /**
   * Find all projects using a specific package
   * @param {string} packageName - Name of the package
   * @returns {Promise<Array>} Projects using the package
   */
  async findProjectsUsingPackage(packageName) {
    const query = `
      MATCH (proj:Project)-[r:DEPENDS_ON]->(pkg:Package {name: $packageName})
      RETURN proj.name as project,
             proj.language as language,
             r.versionConstraint as versionConstraint,
             r.type as dependencyType
      ORDER BY proj.name
    `;

    return await this.client.executeQuery(query, { packageName });
  }

  /**
   * Count total projects and packages in the database
   * @returns {Promise<object>} Database statistics
   */
  async getDatabaseStats() {
    return await this.client.getStats();
  }

  /**
   * Link packages that are also projects to their dependencies
   * This creates Package → Package relationships for circular dependency detection
   * @returns {Promise<number>} Number of package-to-package links created
   */
  async linkPackageDependencies() {
    logger.info('Linking package-to-package dependencies...');
    
    try {
      const query = `
        // Find all packages that are also projects
        MATCH (proj:Project)
        MATCH (pkg:Package {name: proj.name})
        
        // Find the project's dependencies
        MATCH (proj)-[r:DEPENDS_ON]->(depPkg:Package)
        
        // Create Package → Package relationship (if it doesn't exist)
        MERGE (pkg)-[r2:DEPENDS_ON]->(depPkg)
        ON CREATE SET 
          r2.versionConstraint = r.versionConstraint,
          r2.type = r.type,
          r2.source = 'derived',
          r2.createdAt = datetime()
        
        RETURN count(DISTINCT r2) as linksCreated
      `;
      
      const result = await this.client.executeQuery(query);
      // Handle Neo4j integer type (has .low property)
      const count = result[0]?.linksCreated?.low || result[0]?.linksCreated || 0;
      
      logger.success(`✓ Created ${count} package-to-package links`);
      
      return count;
    } catch (error) {
      logger.error('Failed to link package dependencies:', error.message);
      throw error;
    }
  }
}

export default GraphBuilder;