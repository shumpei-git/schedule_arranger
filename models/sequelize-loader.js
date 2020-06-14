'use strict';
const Sequelize = require('sequelize');
const sequelize = new Sequelize(
  'postgres://postgres:postgres@localhost/schedule_arranger_2',
  {
    operatorsAlianses: false,
    logging: false//SQLのログを非表示にした。
  });

module.exports = {
  database: sequelize,
  Sequelize: Sequelize
};