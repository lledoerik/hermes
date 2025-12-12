module.exports = {
  // Usa react-scripts com base
  preset: 'react-scripts',

  // Transforma axios i altres dependències ESM
  transformIgnorePatterns: [
    'node_modules/(?!(axios)/)'
  ],

  // Configuració de mocks globals
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],

  // Entorn de test
  testEnvironment: 'jsdom',

  // Cobertura
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/reportWebVitals.js',
    '!src/**/*.test.{js,jsx}',
    '!src/setupTests.js'
  ],

  // Timeout per tests
  testTimeout: 10000,

  // Mock de mòduls
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js'
  }
};
