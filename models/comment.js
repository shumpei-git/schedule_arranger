'use strict';
const loader = require('./sequelize-loader.js');
const Sequelize = loader.Sequelize;

const Comment = loader.database.define('comments', {
  scheduleId: {
    type: Sequelize.UUID,
    primaryKey: true,
    allowNull: false
  },
  userId: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  comment: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
    freezeTableName: true,
    timestamp: false,
  });

module.exports = Comment;