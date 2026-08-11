class AppRegistry {
  static instance: AppRegistry;
  instances: any; // Store registered instances

  constructor() {
    if (AppRegistry.instance) {
      return AppRegistry.instance;
    }
    this.instances = new Map();
    AppRegistry.instance = this;
  }

  /**
   * Register an instance with a name
   * @param {string} name
   * @param {object} instance
   */
  register(name: string, instance: object) {
    this.instances.set(name, instance);
  }

  /**
   * Retrieve an instance by name
   * @param {string} name
   * @returns {object|undefined} the stored instance or undefined if not found
   */
  get(name: string) {
    return this.instances.get(name);
  }

  // listServices() {
  //   return Array.from(this.instances.keys());
  // }

  // clear() {
  //   this.instances.clear();
  // }

  // // Helper method to call a method on a registered service
  // callServiceMethod(serviceName: string, methodName: string, ...args: any[]) {
  //   const service = this.get(serviceName);
  //   if (!service) {
  //     throw new Error(`Service ${serviceName} not found`);
  //   }
  //   const method = service[methodName];
  //   if (typeof method !== 'function') {
  //     throw new Error(
  //       `Method ${methodName} not found on service ${serviceName}`
  //     );
  //   }
  //   return method.apply(service, args);
  // }
}

const appRegistry = new AppRegistry();

export default appRegistry;
