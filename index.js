/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
// Inspired by: https://github.com/commitizen/cz-conventional-changelog and https://github.com/commitizen/cz-cli

const CZ_CONFIG_NAME = '.cz-config.js';
const findConfig = require('find-config');
const editor = require('editor');
const temp = require('temp').track();
const fs = require('fs');
const path = require('path');
const log = require('./util/logger');
const buildCommit = require('./util/commitGenerator');

/* istanbul ignore next */
function readConfigFile() {
  // First try to find the .cz-config.js config file
  const czConfig = findConfig.require(CZ_CONFIG_NAME, { home: false });
  if (czConfig) {
    return czConfig;
  }

  // fallback to locating it using the config block in the nearest package.json
  let pkg = findConfig('package.json', { home: false });
  if (pkg) {
    const pkgDir = path.dirname(pkg);

    pkg = require(pkg);

    if (pkg.config && pkg.config['cz-customizable'] && pkg.config['cz-customizable'].config) {
      // resolve relative to discovered package.json
      const pkgPath = path.resolve(pkgDir, pkg.config['cz-customizable'].config);

      log.info('>>> Using cz-customizable config specified in your package.json: ', pkgPath);

      return require(pkgPath);
    }
  }

  log.warn(
    'Unable to find a configuration file. Please refer to documentation to learn how to ser up: https://github.com/leonardoanalista/cz-customizable#steps "'
  );
  return null;
}

module.exports = {
  prompter(cz, commit) {
    const config = readConfigFile();
    const subjectLimit = config.subjectLimit || 100;

    cz.prompt.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
    log.info(
      `\n\nLine 1 will be cropped at ${subjectLimit} characters. All other lines will be wrapped after 100 characters.\n`
    );

    const questions = require('./questions').getQuestions(config, cz);
    const confirmCommitCallback = {
      edit(answers) {
        temp.open(null, (err, info) => {
          /* istanbul ignore if */
          if (err) return;

          fs.write(info.fd, buildCommit(answers, config));
          fs.close(info.fd, () => {
            editor(info.path, code => {
              if (code) {
                log.info(`Editor returned non zero value. Commit message was:\n${buildCommit(answers, config)}`);
                return;
              }

              const commitStr = fs.readFileSync(info.path, {
                encoding: 'utf8',
              });
              commit(commitStr);
            });
          });
        });
      },
      yes(answers) {
        commit(buildCommit(answers, config));
      },
      no() {
        log.info('Commit has been canceled.');
      },
    };

    cz.prompt(questions).then(answers => {
      if (confirmCommitCallback[answers.confirmCommit]) {
        confirmCommitCallback[answers.confirmCommit](answers);
      }
    });
  },
};
