'use strict';
const loader = require('./sequelize-loader.js');
const Sequelize = loader.Sequelize;

const Candidate = loader.database.define('candidates', {
  candidateId: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  candidateName: {
    type: Sequelize.STRING,
    allowNull: false
  },
  scheduleId: {
    type: Sequelize.UUID,
    allowNull: false
  }
}, {
    freezeTableName: true,
    timestamp: false,
    indexes: [
      {
        fields: ['scheduleId']
      }
    ]
  });

module.exports = Candidate;