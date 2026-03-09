import { buildApp } from './src/app';

buildApp().then(async app => {
  await app.ready();
  console.log(app.printRoutes());
  process.exit(0);
});
