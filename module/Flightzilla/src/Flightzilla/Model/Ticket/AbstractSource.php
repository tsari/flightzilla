<?php
/**
 * flightzilla
 *
 * Copyright (c) 2012-2013, Hans-Peter Buniat <hpbuniat@googlemail.com>.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in
 * the documentation and/or other materials provided with the
 * distribution.
 *
 * * Neither the name of Hans-Peter Buniat nor the names of his
 * contributors may be used to endorse or promote products derived
 * from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 * FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 * BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @package flightzilla
 * @author Hans-Peter Buniat <hpbuniat@googlemail.com>
 * @copyright 2012-2013 Hans-Peter Buniat <hpbuniat@googlemail.com>
 * @license http://opensource.org/licenses/BSD-3-Clause
 */
namespace Flightzilla\Model\Ticket;

/**
 * Abstract for Ticket-Sources
 *
 * @author Hans-Peter Buniat <hpbuniat@googlemail.com>
 * @copyright 2012-2013 Hans-Peter Buniat <hpbuniat@googlemail.com>
 * @license http://opensource.org/licenses/BSD-3-Clause
 * @version Release: @package_version@
 * @link https://github.com/hpbuniat/flightzilla
 */
abstract class AbstractSource {

    /**
     * The source-request-token
     *
     * @var string
     */
    const REQUEST_TOKEN = 'source-request';

    /**
     * The cache-instance
     *
     * @var \Zend\Cache\Storage\StorageInterface
     */
    protected $_oCache = null;

    /**
     * The auth-instance
     *
     * @var \Flightzilla\Authentication\Adapter
     */
    protected $_oAuth = null;

    /**
     * The cookie-path
     *
     * @var string
     */
    protected $_sCookie = null;

    /**
     * The current user
     *
     * @var \Flightzilla\Model\Resource\Human
     */
    protected $_oUser = null;

    /**
     * The resource-manager
     *
     * @var \Flightzilla\Model\Resource\Manager
     */
    protected $_oResource = null;

    /**
     * The current project
     *
     * @var array
     */
    protected $_aProject = null;

    /**
     * The configuration
     *
     * @var \Zend\Config\Config
     */
    protected $_config = null;

    /**
     * The http-client
     *
     * @var \Zend\Http\Client
     */
    protected $_client = null;

    /**
     * The logger
     *
     * @var \Zend\Log\Logger
     */
    protected $_oLogger;

    /**
     * The timeline-/date-helper
     *
     * @var \Flightzilla\Model\Timeline\Date
     */
    protected $_oDate;

    /**
     * Set the cache
     *
     * @param  \Zend\Cache\Storage\StorageInterface $oCache
     *
     * @return $this
     */
    public function setCache(\Zend\Cache\Storage\StorageInterface $oCache) {
        $this->_oCache = $oCache;
        return $this;
    }

    /**
     * Set the auth-adapter
     *
     * @param  \Flightzilla\Authentication\Adapter $oAuth
     *
     * @return $this
     */
    public function setAuth(\Flightzilla\Authentication\Adapter $oAuth) {
        $this->_oAuth = $oAuth;
        return $this;
    }

    /**
     * Set the logger
     *
     * @param  \Zend\Log\Logger $oLogger
     *
     * @return $this
     */
    public function setLogger(\Zend\Log\Logger $oLogger) {
        $this->_oLogger = $oLogger;
        return $this;
    }

    /**
     * Get the logger
     *
     * @return \Zend\Log\Logger
     */
    public function getLogger() {
        return $this->_oLogger;
    }

    /**
     * Get the current user
     *
     * @return \Flightzilla\Model\Resource\Human
     */
    public function getCurrentUser() {
        $sUser = $this->_oResource->getResourceByLogin($this->_oAuth->getLogin());
        if ($this->_oResource->hasResource($sUser)) {
            $this->_oUser = $this->_oResource->getResource($sUser);
        }

        return (empty($this->_oUser) === true) ? null : $this->_oUser;
    }

    /**
     * Init the curl-client
     *
     * @return $this
     */
    public function initHttpClient() {
        $this->_sCookie = sprintf('%sflightzilla%s', $this->_config->bugzilla->http->cookiePath, md5($this->_oAuth->getLogin()));

        $aCurlOptions = array(
            CURLOPT_COOKIEFILE => $this->_sCookie,
            CURLOPT_COOKIEJAR => $this->_sCookie,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_SSL_VERIFYPEER => false
        );

        if (isset($this->_config->bugzilla->http->proxy) === true) {
            $aCurlOptions[CURLOPT_PROXY] = $this->_config->bugzilla->http->proxy;
        }

        $this->_client->setOptions(array(
            'timeout' => 30,
            'adapter' => 'Zend\Http\Client\Adapter\Curl',
            'curloptions' => $aCurlOptions
        ));

        return $this;
    }

    /**
     * Get the time of the last request
     *
     * @param  string $mSalt
     *
     * @return int
     */
    public function getLastRequestTime($mSalt = '') {
        $sToken = md5($this->getCurrentUser() . self::REQUEST_TOKEN . $mSalt);

        $iTime = $this->_oCache->getItem($sToken);
        if (empty($iTime) === true) {
            $this->_oCache->setItem($sToken, time());
        }

        return $iTime;
    }

    /**
     * Get the search-time-modifier
     *
     * @param  int $iTime
     * @param  int $iMax
     *
     * @return string
     */
    public function getSearchTimeModifier($iTime, $iMax = 0) {
        $iTime = (int) $iTime;
        $sToday = date('dmy');
        $sRef = date('dmy', $iTime);

        $sReturn = sprintf('%dd', $iMax);
        if ($sToday === $sRef) {
            if ((time() - $iTime) < 30) {
                $sReturn = '';
            }
        }

        return $sReturn;
    }

    /**
     * Get the config
     *
     * @return \Zend\Config\Config
     */
    public function getConfig() {
        return $this->_config;
    }

    /**
     * Get the timeline-/date-helper
     *
     * @return \Flightzilla\Model\Timeline\Date
     */
    public function getDate() {
        return $this->_oDate;
    }

    /**
     * Get the resource-manager
     *
     * @return \Flightzilla\Model\Resource\Manager
     */
    public function getResourceManager() {

        return $this->_oResource;
    }
}
