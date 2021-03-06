
import qs from 'querystring';
import moment from 'moment';
import redis from 'redis';
import chalk from 'chalk';

const client = redis.createClient();
const defaults = {};

export function before(options) { // eslint-disable-line no-unused-vars
  options = Object.assign({}, defaults, options);

  return function (hook) {
    return new Promise(resolve => {
      let path = '';

      if (!hook.id && Object.keys(hook.params.query).length === 0) {
        path = `${hook.path}`;
      } else if (!hook.id && Object.keys(hook.params.query).length > 0) {
        path = `${hook.path}?${qs.stringify(hook.params.query)}`;
      } else if (hook.id && Object.keys(hook.params.query).length > 0) {
        path = `${hook.id}?${qs.stringify(hook.params.query)}`;
      } else {
        path = `${hook.id}`;
      }

      client.get(path, (err, reply) => {
        if (err !== null) resolve(hook);
        if (reply) {
          hook.result = JSON.parse(reply);
          resolve(hook);
          const duration = moment(hook.result.cache.expiresOn).format('DD MMMM YYYY - HH:mm:ss');

          console.log(
            `${chalk.cyan('[redis]')} returning cached value for ${chalk.green(path)}.
            Expires on ${duration}.`
          );
        } else {
          resolve(hook);
        }
      });
    });
  };
};

export function after(options) { // eslint-disable-line no-unused-vars
  options = Object.assign({}, defaults, options);

  return function (hook) {
    return new Promise(resolve => {
      if (!hook.result.cache.cached) {
        const q = hook.params.query;
        let path = '';

        if (!hook.id && Object.keys(q).length === 0) {
          path = `${hook.path}`;
        } else if (!hook.id && Object.keys(q).length > 0) {
          path = `${hook.path}?${qs.stringify(q)}`;
        } else if (hook.id && Object.keys(q).length > 0) {
          path = `${hook.id}?${qs.stringify(q)}`;
        } else {
          path = `${hook.id}`;
        }
        const duration = hook.result.cache.duration || 3600 * 24;

        // adding a cache object
        Object.assign(hook.result.cache, {
          cached: true,
          duration: duration,
          expiresOn: moment().add(moment.duration(duration)),
          parent: hook.path,
          group: `group-${hook.path}`,
          key: path
        });

        client.set(path, JSON.stringify(hook.result));
        client.expire(path, hook.result.cache.duration);
        client.rpush(hook.result.cache.group, path);
        if (process.env.NODE_ENV !== 'test') {
          console.log(
            `${chalk.cyan('[redis]')} added ${chalk.green(path)} to the cache.
            Expires in ${moment.duration(duration).humanize()}.`);
        }
      }
      resolve(hook);
    });
  };
};
