var assert = require("assert");
var path = require("path");

describe("Tag", function() {
  var reposPath = path.resolve("test/repos/workdir/.git");

  var Repository = require("../../lib/repository");
  var Obj = require("../../lib/object");
  var Oid = require("../../lib/oid");

  var tagName = "annotated-tag";
  var tagFullName = "refs/tags/" + tagName;
  var tagOid = "dc800017566123ff3c746b37284a24a66546667e";
  var commitPointedTo = "32789a79e71fbc9e04d3eff7425e1771eb595150";
  var tagMessage = "This is an annotated tag\n";

  function testTag(tag) {
    assert.equal(tag.name(), tagName);
    assert.equal(tag.targetType(), Obj.TYPE.COMMIT);
    assert.equal(tag.message(), tagMessage);

    var target = tag.target();

    assert.ok(target.isCommit());
    assert.equal(target.id().toString(), commitPointedTo);
  }

  before(function() {
    var test = this;

    return Repository.open(reposPath).then(function(repo) {
      test.repo = repo;

      return repo;
    });
  });

  it("can get a tag from a repo via the tag name", function() {
    return this.repo.getTagByName(tagName).then(function(tag) {
      testTag(tag);
    });
  });

  it("can get a tag from a repo via the long tag name", function() {
    return this.repo.getTagByName(tagFullName).then(function(tag) {
      testTag(tag);
    });
  });

  it("can get a tag from a repo via the tag's OID as a string", function() {
    return this.repo.getTag(tagOid).then(function(tag) {
      testTag(tag);
    });
  });

  it("can get a tag from a repo via the tag's OID object", function() {
    var oid = Oid.fromString(tagOid);

    return this.repo.getTag(oid).then(function(tag) {
      testTag(tag);
    });
  });
});
