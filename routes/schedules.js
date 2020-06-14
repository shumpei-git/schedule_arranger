'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');
const Comment = require('../models/comment');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, (req, res, next) => {
  const scheduleId = uuid.v4();
  const updatedAt = new Date();
  Schedule.create({//scheduleテーブルにレコードを保存
    scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255) || '（名称未設定）',
    memo: req.body.memo.slice(0, 1000),
    createdBy: req.user.id,
    updatedAt
  }).then((schedule) => {//scheduleオブジェクトにはテーブルに保存したレコードの情報が入っている
    createCandidatesAndRedirect(parseCandidateNames(req), scheduleId, res);
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  let storedSchedule = null;
  let storedCandidates = null;
  Schedule.findOne({
    include: [{
        model: User,
        attributes: ['userId', 'username']
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['"updatedAt', 'DESC']]
  }).then((schedule) => {
    if (schedule) {
      storedSchedule = schedule;
      return Candidate.findAll({
        where: { scheduleId: schedule.scheduleId},
        order: [['"candidateId"', 'ASC']]
      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  }).then((candidates) => {
    //データベースからその予定の全ての出欠を取得する
    storedCandidates = candidates;
    return Availability.findAll({
      include: [
        {
          model: User,
          attribute: ['userId', 'username']
        }
      ],
      where: { scheduleId: storedSchedule.scheduleId},
      order: [[User, 'username', 'ASC'], ['"candidateId', 'ASC']]
    });
  }).then((availabilities) => {
    //出欠MapMap（キー:ユーザーID, 値:出欠Map（キー:候補ID, 値:出欠））を作成する
    const availabilityMapMap = new Map(); // key: userId, value: Map(key: candidateId, availability)
    availabilities.forEach((a) => {
      const map = availabilityMapMap.get(a.user.userId) || new Map();
      map.set(a.candidateId, a.availability);
      availabilityMapMap.set(a.user.userId, map);
    });

    //閲覧ユーザーと出欠にひもづくユーザーからユーザーMap（キー:ユーザーID, 値:ユーザー）を作る
    const userMap = new Map(); // key: userId, value: User object
    const reqUserId = parseInt(req.user.id);
    userMap.set(reqUserId, {
      isSelf: true,
      userId: reqUserId,
      username: req.user.username
    });
    availabilities.forEach((a) => {
      userMap.set(a.user.userId, {
        isSelf: reqUserId === a.user.userId, //閲覧ユーザー自身であるか確かめる
        userId: a.user.userId,
        username: a.user.username
      });
    });

    //全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
    const users = Array.from(userMap).map((keyValue) => keyValue[1]);
    users.forEach((u) => {
      storedCandidates.forEach((c) => {
        const map = availabilityMapMap.get(u.userId) || new Map();
        const a = map.get(c.candidateId) || 0; //デフォルト値は0を利用
        map.set(c.candidateId, a);
        availabilityMapMap.set(u.userId, map);
      });
    });

    //コメント取得
    Comment.findAll({
      where: { scheduleId: storedSchedule.scheduleId}
    }).then((comments) => {
      const commentMap = new Map(); // key: userId, value: comment
      comments.forEach((comment) => {
        commentMap.set(comment.userId, comment.comment);
      });
      res.render('schedule', {
        user: req.user,
        schedule: storedSchedule,
        candidates: storedCandidates,
        users: users,
        availabilityMapMap: availabilityMapMap,
        commentMap: commentMap
      });
    });
  });
});

router.get('/:scheduleId/edit', authenticationEnsurer, (req, res, next) => {
  Schedule.findOne({
    where: {
      scheduleId: req.params.scheduleId
    }
  }).then((schedule) => {
    if (isMine(req, schedule)) { // 作成者のみが編集フォームを開ける
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['"candidateId"', 'ASC']]
      }).then((candidates) => {
        res.render('edit', {
          user: req.user,
          schedule: schedule,
          candidates: candidates
        });
      });
    } else {
      const err = new Error('指定された予定がない、または、予定する権限がありません');
      err.status = 404;
      next(err);
    }
  });
});

function isMine(req, schedule) {
  return schedule && parseInt(schedule.createdBy) === parseInt(req.user.id);
}

router.post('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  Schedule.findOne({
    where: {
      scheduleId: req.params.scheduleId
    }
  }).then((schedule) => {
    if (schedule && isMine(req, schedule)) {
      if (parseInt(req.query.edit) === 1) {
        const updatedAt = new Date();
        schedule.update({
          scheduleId: schedule.scheduleId,
          scheduleName: req.body.scheduleName.slice(0, 255) || '（名称未設定）',
          memo: req.body.memo,
          createdBy: req.user.id,
          updatedAt: updatedAt
        }).then((schedule) => {
          // 追加されているかチェック
          const candidateNames = parseCandidateNames(req);
          if (candidateNames) {
            createCandidatesAndRedirect(candidateNames, schedule.scheduleId, res);
          } else {
            res.redirect('/schedules/' + schedule.scheduleId);
          }
        });
      } else if (parseInt(req.query.delete) === 1) {
        deleteScheduleAggregate(req.params.scheduleId, () => {
          res.redirect('/');
        });
      } else {
        const err = new Error('不正なリクエストです');
        err.status = 400;
        next(err);
      }
    } else {
      const err = new Error('指定された予定がない、または、編集する権限がありません');
      err.status = 404;
      next(err);
    }
  });
});

function deleteScheduleAggregate(scheduleId, done, err) {
  const promiseCommentDestroy = Comment.findAll({
    where: { scheduleId: scheduleId }
  }).then((comments) => { 
    return Promise.all(comments.map((c) => { return c.destroy(); }));
  });

  Availability.findAll({
    where: { scheduleId: scheduleId}
  }).then((availabilities) => {
    const promises = availabilities.map((a) => { return a.destroy(); });
    return Promise.all(promises);
  }).then(() => {
    return Candidate.findAll({
      where: { scheduleId: scheduleId }
    });
  }).then((candidates) => {
    const promises = candidates.map((c) => { return c.destroy();});
    promises.push(promiseCommentDestroy);
    return Promise.all(promises);
  }).then(() => {
    return Schedule.findById(scheduleId).then((s) => { return s.destroy(); });
  }).then(() => {
    if (err) return done(err);
    done();
  });
}

router.deleteScheduleAggregate = deleteScheduleAggregate;

function createCandidatesAndRedirect(candidateNames, scheduleId, res) {
    const candidates = candidateNames.map((c) => {//candidateNames配列から、オブジェクトを要素に持つcandidates配列を作成
      return {
        candidateName: c,
        scheduleId: scheduleId
      };
    });
    Candidate.bulkCreate(candidates).then(() => {
      res.redirect('/schedules/' + scheduleId);
    });
}

function parseCandidateNames(req) {
  return req.body.candidates//候補日程を配列として取得するための処理
      .trim()
      .split('\n')//候補の分割。改行を目印に分割。
      .map((s) => s.trim())//各候補の余計なスペースを削除
      .filter((s) => s !== "");//空の候補は除外
}

module.exports = router;