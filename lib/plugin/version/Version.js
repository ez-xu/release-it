import { styleText } from 'node:util';
import {
  coerce,
  increment as incrementVersion,
  isGreaterThan,
  isGreaterThanOrEqual,
  isPrerelease,
  isValid,
  normalizeFull
} from 'verkit';
import Plugin from '../Plugin.js';

const RELEASE_TYPES = ['patch', 'minor', 'major'];
const PRERELEASE_TYPES = ['prepatch', 'preminor', 'premajor'];
const CONTINUATION_TYPES = ['prerelease', 'pre'];
const ALL_RELEASE_TYPES = [...RELEASE_TYPES, ...PRERELEASE_TYPES, ...CONTINUATION_TYPES];

const CHOICES = {
  latestIsPreRelease: [CONTINUATION_TYPES[0], ...RELEASE_TYPES],
  preRelease: PRERELEASE_TYPES,
  default: [...RELEASE_TYPES, ...PRERELEASE_TYPES]
};

const EXIT = Symbol('exit');

const getIncrementChoices = context => {
  const { latestIsPreRelease, isPreRelease, preReleaseId, preReleaseBase } = context.version;
  const types = latestIsPreRelease ? CHOICES.latestIsPreRelease : isPreRelease ? CHOICES.preRelease : CHOICES.default;
  const incrementOptions = { identifier: preReleaseId, identifierBase: preReleaseBase };
  const choices = types.map(increment => ({
    name: `${increment} (${incrementVersion(context.latestVersion, increment, incrementOptions)})`,
    value: increment
  }));
  const otherChoice = {
    name: 'Other, please specify...',
    value: null
  };
  const exitChoice = {
    name: 'Exit',
    value: EXIT
  };
  return [...choices, otherChoice, exitChoice];
};

const versionTransformer = context => input =>
  isValid(input)
    ? isGreaterThan(input, context.latestVersion)
      ? styleText('green', input)
      : styleText('red', input)
    : styleText(['red', 'bold'], input);

const prompts = {
  incrementList: {
    type: 'list',
    message: () => 'Select increment (next version):',
    choices: context => getIncrementChoices(context),
    pageSize: 9
  },
  version: {
    type: 'input',
    message: () => `Please enter a valid version:`,
    transformer: context => versionTransformer(context),
    validate: input => isValid(input) || 'The version must follow the semver standard.'
  }
};

class Version extends Plugin {
  constructor(...args) {
    super(...args);
    this.registerPrompts(prompts);
  }

  getIncrement(options) {
    return options.increment;
  }

  getIncrementedVersionCI(options) {
    return this.incrementVersion(options);
  }

  async getIncrementedVersion(options) {
    const { isCI } = this.config;
    const version = this.incrementVersion(options);
    return version || (isCI ? null : await this.promptIncrementVersion(options));
  }

  promptIncrementVersion(options) {
    return new Promise(resolve => {
      this.step({
        prompt: 'incrementList',
        task: increment => {
          if (increment === EXIT) process.exit(0);
          return increment
            ? resolve(this.incrementVersion(Object.assign({}, options, { increment })))
            : this.step({ prompt: 'version', task: resolve });
        }
      });
    });
  }

  incrementVersion({ latestVersion, increment, isPreRelease, preReleaseId, preReleaseBase }) {
    if (increment === false) return latestVersion;

    const latestIsPreRelease = isPrerelease(latestVersion);
    const isValidVersion = typeof increment === 'string' && isValid(increment);
    const incrementOptions = { identifier: preReleaseId, identifierBase: preReleaseBase };

    if (latestVersion) {
      this.setContext({ latestIsPreRelease });
    }

    // `latestVersion` is absent for a first release (verkit then compares against 0.0.0),
    // but a non-semver tag would make the comparison throw.
    const latestIsComparable = latestVersion == null || (typeof latestVersion === 'string' && isValid(latestVersion));
    if (isValidVersion && latestIsComparable) {
      if (isGreaterThanOrEqual(increment, latestVersion)) {
        return increment;
      }
    }

    if (isPreRelease && !increment && latestIsPreRelease) {
      return incrementVersion(latestVersion, 'prerelease', incrementOptions);
    }

    if (this.config.isCI && !increment) {
      if (isPreRelease) {
        return incrementVersion(latestVersion, 'prepatch', incrementOptions);
      } else {
        return incrementVersion(latestVersion, 'patch');
      }
    }

    const normalizedType = RELEASE_TYPES.includes(increment) && isPreRelease ? `pre${increment}` : increment;
    if (ALL_RELEASE_TYPES.includes(normalizedType)) {
      return incrementVersion(latestVersion, normalizedType, incrementOptions);
    }

    const coercedVersion = !isValidVersion && normalizeFull(coerce(increment));
    if (coercedVersion) {
      if (typeof increment !== 'string') {
        return coercedVersion;
      }
      if (increment.startsWith(coercedVersion) && /^[.-]?\d/.test(increment.slice(coercedVersion.length))) {
        // The coercible semver is only a prefix of what the user passed, and the rest is a
        // dotted continuation: returning the semver would silently drop it
        // (e.g. "3.3.0.7_feature_modbus-regs_G5_20261012_0de3e49f" -> "3.3.0").
        // Declared version strings are used verbatim instead.
        return increment;
      }
      this.log.warn(`Coerced invalid semver version "${increment}" into "${coercedVersion}".`);
      return coercedVersion;
    }
  }
}

export default Version;
