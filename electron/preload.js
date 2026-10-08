const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('housevaultDesktop', { version: require('../package.json').version, platform: process.platform });
