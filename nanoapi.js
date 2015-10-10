var http = require('http'),
    xml2js = require('simple-xml2json'),
    boo = require('boo'),
    NanoApi;

function get_url(url, callback) {
  var content = "";
  http.get(url, function(res) {
    res.on('data', function(chunk) {
      content += chunk.toString();
    });
    res.on('end', function() {
      callback(content);
    });
  });
}

NanoApi = boo.Base.derive({
  base_url: "http://nanowrimo.org/wordcount_api/"
, region: "central-south-america-brazil"

, get_region_info: function(callback) {
  get_url(this.base_url + 'wcregion/' + this.region, function(content) {
    var json = xml2js.parser(content);
    callback(json.wcregion);
  });
}

});

module.exports = new NanoApi.constructor();

