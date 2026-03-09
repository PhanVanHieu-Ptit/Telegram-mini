import { buildApp } from './src/app';

buildApp().then(async app => {
  try {
    await app.ready();
    console.log(app.printRoutes());
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
});
