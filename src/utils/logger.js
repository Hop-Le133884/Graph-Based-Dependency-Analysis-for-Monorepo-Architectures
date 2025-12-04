// src/utils/logger.js
/**
 * Simple logging utility with colors
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

export const logger = {
  success(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
  },

  error(message) {
    console.log(`${colors.red}✗${colors.reset} ${message}`);
  },

  warning(message) {
    console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
  },

  info(message) {
    console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
  },

  header(message) {
    const line = '='.repeat(60);
    console.log(`\n${colors.bright}${line}${colors.reset}`);
    console.log(`${colors.bright}${message}${colors.reset}`);
    console.log(`${colors.bright}${line}${colors.reset}\n`);
  },

  section(message) {
    console.log(`\n${colors.cyan}${message}${colors.reset}`);
  },

  log(message) {
    console.log(message);
  }
};

export default logger;