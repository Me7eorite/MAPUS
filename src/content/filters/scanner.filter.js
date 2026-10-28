const regexCache = {
  coordPattern: /^coord/,
  valuePattern: /^\/|true|false|register|signUp|basic|http/i,
  chinesePattern: /^[\u4e00-\u9fa5]+$/,
  camelCasePattern: /\b[_a-z]+(?:[A-Z][a-z]+)+\b/,
};
const SCANNER_FILTER = {
  api: (function() {
    return function(match, url, resultsSet) {
      match = match.slice(1, -1);
      if (SCANNER_CONFIG.API.FONT_PATTERN.test(match)) {
        return false;
      }
      if (match.endsWith('.vue')) {
        resultsSet?.vueFiles?.set(match, url);
        return true;
      }
      if (SCANNER_CONFIG.API.IMAGE_PATTERN.test(match)) {
        resultsSet?.imageFiles?.set(match, url);
        return true;
      }
      if (SCANNER_CONFIG.API.JS_PATTERN.test(match)) {
        resultsSet?.jsFiles?.set(match, url);
        return true;
      }
      if (SCANNER_CONFIG.API.DOC_PATTERN.test(match)) {
        resultsSet?.docFiles?.set(match, url);
        return true;
      }
      const lcMatch = match.toLowerCase();
      const shouldFilter = SCANNER_CONFIG.API.FILTERED_CONTENT_TYPES.some(type =>
        lcMatch==type.toLowerCase()
      );
      if (shouldFilter) {
        return false;
      }
      if (match.startsWith('./')) {
        resultsSet?.moduleFiles?.set(match, url);
        return true;
      }
      if (match.startsWith('/')) {
        if(match.length<=4&&/[A-Z\.\/\#\+\?23]/.test(match.slice(1))) return false;
        resultsSet?.absoluteApis?.set(match, url);
      } else {
        if (/^(audio|blots|core|ace|icon|css|formats|image|js|modules|text|themes|ui|video|static|attributors|application)/.test(match)) return false;
        if(match.length<=4) return false;
        resultsSet?.apis?.set(match, url);
      }
      return true;
    };
  })(),

  domain: (function() {
    const decodeCache = new Map();
    const validate = {
      clean(domain) {
        try {
          domain = domain.replace(/^['"]|['"]$/g, '');
          domain = domain.toLowerCase();
          if (decodeCache.has(domain)) {
            domain = decodeCache.get(domain);
          } else {
            try {
              const decoded = decodeURIComponent(domain.replace(/\+/g, ' '));
              decodeCache.set(domain, decoded);
              domain = decoded;
            } catch {
              decodeCache.set(domain, domain);
            }
          }
          const filterMatch = domain.match(SCANNER_CONFIG.PATTERNS.DOMAIN_FILTER);
          if (/\b[a-z]+\.(?:top|bottom)-[a-z]+\.top\b/.test(filterMatch[0])) return false;
          if (filterMatch && filterMatch[0].split('.')[0]!="el" && filterMatch[0].split('.')[0]!="e") {
            domain = filterMatch[0];
          } else {
            return false;
          }

          return domain;
        } catch {
          return false;
        }
      },

      notInBlacklist(domain) {
        return !SCANNER_CONFIG.DOMAIN.BLACKLIST.some(blacklisted =>
          domain.includes(blacklisted)
        );
      }
    };

    return function(match, url, resultsSet) {
      match = validate.clean(match);
      if (!match) return false;

      if (!validate.notInBlacklist(match)) {
        return false;
      }

      resultsSet?.domains?.set(match, url);
      return true;
    };
  })(),

  ip: (function() {
    const validate = {
      notSpecial(ip) {
        return !SCANNER_CONFIG.IP.SPECIAL_RANGES.some(range => range.test(ip));
      }
    };

    return function(match, url, resultsSet) {
      match = match.replace(/^[`'"]|[`'"]$/g, '');
      const ipMatch = match.match(SCANNER_CONFIG.PATTERNS.IP);
      if (ipMatch) {
        const extractedIp = ipMatch[0];
        if (!validate.notSpecial(extractedIp)) return false;
        resultsSet?.ips?.set(extractedIp, url);
      }
      return true;
    };
  })(),

  phone: (match, url, resultsSet) => {
    resultsSet?.phones?.set(match, url);
    return true;
  },

  email: (match, url, resultsSet) => {
    resultsSet?.emails?.set(match, url);
    return true;
  },

  idcard: (match, url, resultsSet) => {
    resultsSet?.idcards?.set(match, url);
    return true;
  },

  url: (match, url, resultsSet) => {
    try {
      if (match.toLowerCase().includes('github.com/')) {
        resultsSet?.githubUrls?.set(match, url);
        return true;
      }
      resultsSet?.urls?.set(match, url);
      const matchUrl = new URL(match);
      const currentHost = window.location.host;
      if (matchUrl.host === currentHost) {
        const path = matchUrl.pathname;
        if (SCANNER_CONFIG.API.FONT_PATTERN.test(path)) {
          return false;
        }
        if (SCANNER_CONFIG.API.IMAGE_PATTERN.test(path)) {
          resultsSet?.imageFiles?.set(path, url);
          return true;
        }
        if (SCANNER_CONFIG.API.JS_PATTERN.test(path)) {
          resultsSet?.jsFiles?.set(path, url);
          return true;
        }
        if (SCANNER_CONFIG.API.DOC_PATTERN.test(path)) {
          resultsSet?.docFiles?.set(path, url);
          return true;
        }

        if (!path.match(/\.[a-zA-Z0-9]+$/)) {
          if (path.startsWith('/')) {
            resultsSet?.absoluteApis?.set(path, url);
          } else {
            resultsSet?.apis?.set(path, url);
          }
          return true;
        }
      }
    } catch (e) {
      console.error('Error processing URL:', e);
    }

    return true;
  },

  jwt: (match, url, resultsSet) => {
    resultsSet?.jwts?.set(match, url);
    return true;
  },

  aws_key: (match, url, resultsSet) => {
    resultsSet?.awsKeys?.set(match, url);
    return true;
  },

  company: (match, url, resultsSet) => {
    if(/[（）]/.test(match)&&!match.match(/（\S*）/)) return false;
    if (Array.from(SCANNER_CONFIG.BLACKLIST.CHINESE_BLACKLIST).some(blackWord=>match.includes(blackWord))) return false;
    resultsSet?.companies?.set(match, url);
    return true;
  },

  credentials: (match, url, resultsSet) => {
    const valueMatch = match.replace(/\s+/g,'').split(/[:=]/);
    if (valueMatch.length < 2) return false;
    var key = valueMatch[0].replace(/['"]/g,'').toLowerCase();
    var value = valueMatch[1].replace(/['"\{\}\[\]\，\：\。\？\、\?\!\>\<]/g,'').toLowerCase();
    if (!value.length) {
      return false;
    }
    if (regexCache.coordPattern.test(key) || regexCache.valuePattern.test(value) || value.length<=1) return false;
    if (regexCache.chinesePattern.test(value)) return false;

    resultsSet?.credentials?.set(match, url);
    return true;
  },

  cookie: (match, url, resultsSet) => {
    const valueMatch = match.replace(/\s+/g,'').split(/[:=]/);
    if (valueMatch.length < 2) return false;
    if (valueMatch[1].replace(/['"]/g,'').length<4) {
      return false;
    }
    var key = valueMatch[0].replace(/['"<>]/g,'').toLowerCase();
    var value = valueMatch[1].replace(/['"<>]/g,'').toLowerCase();
    if (!value.length||key==value) {
      return false;
    }
    if (value.length<12){
      if(Array.from(SCANNER_CONFIG.BLACKLIST.SHORT_VALUES).some(blackWord=>value.includes(blackWord))){
        return false;
      }
    }else{
      if(Array.from(SCANNER_CONFIG.BLACKLIST.MEDIUM_VALUES).some(blackWord=>value.includes(blackWord))){
        return false;
      }
    }
    resultsSet?.cookies?.set(match, url);
    return true;
  },

  id_key: (match, url, resultsSet) => {
    const hasDelimiter = match.match(/[:=]/);

    if (hasDelimiter || match.length >= 32) {
      if (hasDelimiter) {
        const valueMatch = match.replace(/\s+/g,'').split(/[:=]/);
        var key = valueMatch[0].replace(/['"<>]/g,'');
        var value = valueMatch[1].replace(/['"><]/g,'');
        const keyLower = key.toLowerCase();
        const valueLower = value.toLowerCase();

        if (!value.length || keyLower === valueLower) {
          return false;
        }
        if(Array.from(SCANNER_CONFIG.ID_KEY.KEY_BLACKLIST).some(blackWord=>keyLower.includes(blackWord))){
          return false;
        }
        if(value.length<16){
          if(Array.from(SCANNER_CONFIG.BLACKLIST.SHORT_VALUES).some(blackWord=>valueLower.includes(blackWord))){
            return false;
          }
          if(Array.from(SCANNER_CONFIG.BLACKLIST.MEDIUM_VALUES).some(blackWord=>valueLower.includes(blackWord))){
            return false;
          }
        }else{
          if(Array.from(SCANNER_CONFIG.BLACKLIST.MEDIUM_VALUES).some(blackWord=>valueLower.includes(blackWord))){
            return false;
          }
          if(Array.from(SCANNER_CONFIG.BLACKLIST.LONG_VALUES).some(blackWord=>valueLower.includes(blackWord))){
            return false;
          }
        }
        if (key === "key" && (value.length <= 8 || regexCache.camelCasePattern.test(value))) {
          return false;
        }
        if (value.length <= 3) {
          return false;
        }
      } else {
        if (/^[a-zA-Z]+$/.test(match.slice(1,-1))) {
          return false;
        }
        if(Array.from(SCANNER_CONFIG.BLACKLIST.MEDIUM_VALUES).some(blackWord=>match.includes(blackWord))){
          return false;
        }
        if(Array.from(SCANNER_CONFIG.BLACKLIST.LONG_VALUES).some(blackWord=>match.includes(blackWord))){
          return false;
        }
      }
      resultsSet?.idKeys?.set(match, url);
      return true;
    }
    return false;
  },

  finger: (fingerName, fingerClass, fingerType, fingerDescription, url, resultsSet, fingerExtType, fingerExtName) => {
    var fingerprint = {};
    fingerprint.type = fingerType;
    fingerprint.name = fingerClass;
    fingerprint.description = `通过${fingerName}识别到${fingerClass}${fingerDescription}`;
    fingerprint.version = fingerClass;
    if(fingerExtType){
      fingerprint.extType = fingerExtType;
      fingerprint.extName = fingerExtName;
    }
    chrome.runtime.sendMessage({
      type: 'UPDATE_BUILDER',
      finger: fingerprint
    });
    resultsSet?.fingers?.set(fingerClass, url);
    return true;
  }
};

window.SCANNER_FILTER = SCANNER_FILTER;
window.apiFilter = SCANNER_FILTER.api;
window.domainFilter = SCANNER_FILTER.domain;
window.ipFilter = SCANNER_FILTER.ip;
