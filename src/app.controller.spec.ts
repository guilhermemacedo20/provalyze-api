import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  const controller = new AppController(new AppService());

  it('should return ok status', () => {
    const result = controller.getStatus();

    expect(result).toBe('Ok!');
  });
});
