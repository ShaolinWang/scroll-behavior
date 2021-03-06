module.exports = {
  env: {
    mocha: true,
  },
  globals: {
    expect: false,
  },
  rules: {
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
      },
    ],
  },
};
