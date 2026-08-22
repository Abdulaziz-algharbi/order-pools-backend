import { EventEmitter } from 'events';

class AppBroker {
  private eventEmitter: EventEmitter;

  constructor() {
    this.eventEmitter = new EventEmitter();
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.eventEmitter.on(event, handler);

    return () => {
      this.eventEmitter.off(event, handler);
    };
  }

  emit(event: string, ...args: any[]) {
    this.eventEmitter.emit(event, ...args);
  }
}

const appBroker = new AppBroker();

export default appBroker;
