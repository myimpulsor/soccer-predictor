//Modules Import
var express = require('express');
var app = express();
var request = require('sync-request');
var _ = require("lodash");
var format = require('string-format')
var soccerPredictor = require("soccer-predictor");

var urlJsonUOL = 'http://jsuol.com.br/c/monaco/utils/gestor/commons.js?callback=simulador_dados_jsonp&file=commons.uol.com.br/sistemas/esporte/modalidades/futebol/campeonatos/dados/{0}/30/dados.json';
var urlMercadoCartola = 'https://api.cartolafc.globo.com/mercado/status';
var config = {headers: {'User-Agent':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'}};

//-------------------------------------[INIT API]-------------------------------------//
// Add headers
app.use(function(req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    //res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    //res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Pass to next layer of middleware
    next();
});   

app.get('/prediction/campeonato-brasileiro/:ano/serie/a/:rodada', function(req, res) {  

    if(req.params.rodada > 1){
    //Get Data
    var dataString = request('GET', format(urlJsonUOL, req.params.ano), config).getBody('utf8').replace("simulador_dados_jsonp(", "").replace("} );", "}");   
    var data = JSON.parse(dataString);
       
    //Get Rodada
    var rodada = parseInt(req.params.rodada);
    
    //Get Result Rodadas
    var resultsRodadas = getRodadas(data, rodada);

    // Use analyseResults to return an array of teams with stats
    const teams = soccerPredictor.analyseResults(resultsRodadas, getMatchDetailByRodadas);

    var result = getPrediction(data, teams, rodada); 
    res.json(result);
    }
    else{
        res.json({"Error" : "40404"});
    }
});

app.get('/campeonato-brasileiro/:ano/serie/a/info', function(req, res) {  

   var ano = req.params.ano;    
    //Get Data - UOL
    var dataString = request('GET', format(urlJsonUOL, ano), config).getBody('utf8').replace("simulador_dados_jsonp(", "").replace("} );", "}");   
    var data = JSON.parse(dataString);
    var keys = Object.keys(data.fases);
    
    if(ano == new Date().getFullYear()){
        //Get Data - Cartola
        var dataStringCt = request('GET', urlMercadoCartola, config).getBody('utf8');   
        var dataCt = JSON.parse(dataStringCt);  
       res.json({campeonato: data["nome-comum"], rodadaAtual:parseInt(dataCt.rodada_atual),rodadaTotal:parseInt(data.fases[keys[0]].rodada.total), mercadoStatus: dataCt.status_mercado});
    }
    else{
        res.json({campeonato: data["nome-comum"], rodadaAtual:parseInt(data.fases[keys[0]].rodada.atual),rodadaTotal:parseInt(data.fases[keys[0]].rodada.total)});
    }
});


// Function to return teams and scores based on the
function getMatchDetailByRodadas (data) {
 var result = {
    homeTeamName: data.timeMandante,
    awayTeamName: data.timeVisitante,
    homeGoals: data.golsMandante,
    awayGoals: data.golsVisitante
  }  
  
  return result;
}

function getHistoricoResultados(mandante, visitante){

    var cheerio = require('cheerio');
    var link = format('http://futpedia.globo.com/confronto/{0}-x-{1}', visitante, mandante); 
    console.log(link);
    var html = request('GET', link, config).getBody('utf8');   
    $ = cheerio.load(html);   
    var jogos = $('div#resultado-dos-jogos.scroll-content').html();   
    $ = cheerio.load(jogos);
    var resultados = [];  
    $('div.ano').each(function(index) {
       var ano  = $(this).find('.ano-content').html();
       var jogos = [];
       $(this).find('a').each(function(index) {
            var mandante = $(this).find('div.ge-tooltip div.content img').first().attr("alt");
            var golsMandante = $(this).find('div.ge-tooltip div.content span.placar').first().text();
            var visitante = $(this).find('div.ge-tooltip div.content img').last().attr("alt");
            var golsVisitante = $(this).find('div.ge-tooltip div.content span.placar').last().text();
            var data = $(this).find('div.ge-tooltip div.content span.data').text();           
            jogos.push({timeMandante:mandante, golsMandante:golsMandante, timeVisitante:visitante,  golsVisitante:golsVisitante, data:data});
            
        });       
       resultados.push({ano:ano, jogos:jogos});
    });
    return resultados;
}

function getRodadas(data, actualRodada){
   
    var result = [];
    var keys = Object.keys(data.fases);

    //Get Jogos
    for (i = 1; i < actualRodada; i++) {   
        var jogos = data.fases[keys[0]].jogos.rodada[i];
        for(var x in jogos){
        
            //Get Info Jogo
            var jogo = data.fases[keys[0]].jogos.id[jogos[x]]; 
            var timeMandante = data.equipes[jogo.time1];
            var golsMandante = parseInt(jogo.placar1);
            var timeVisitante = data.equipes[jogo.time2];
            var golsVisitante = parseInt(jogo.placar2);

            result.push({timeMandante:timeMandante["nome-comum"],golsMandante:golsMandante, timeVisitante:timeVisitante["nome-comum"], golsVisitante:golsVisitante, rodada:jogo.rodada, data:jogo.data});
            
        }
    }

    
    return result;
}


function getPrediction(data, teams, actualRodada){
   
    var matchs = [];
    var keys = Object.keys(data.fases);
    var jogos = data.fases[keys[0]].jogos.rodada[actualRodada];
    for(var x in jogos){
        var match = {};
        
        var jogo = data.fases[keys[0]].jogos.id[jogos[x]]; 
        var timeMandante = data.equipes[jogo.time1];
        var timeVisitante = data.equipes[jogo.time2];
        
        const homeTeam = _.find(teams, o => o.name === timeMandante["nome-comum"]);
        const awayTeam = _.find(teams, o => o.name === timeVisitante["nome-comum"]);
        
        const probs = soccerPredictor.calculateProbabilities(homeTeam, awayTeam);
        match.timeCasa = {};
        match.timeCasa.nome = homeTeam.name;
        match.timeCasa.escudo = timeMandante["brasao"];
        match.timeCasa.placar = jogo.placar1 == null ?  "?" : jogo.placar1;
        match.timeVisitante = {};
        match.timeVisitante.nome = awayTeam.name;
        match.timeVisitante.escudo = timeVisitante["brasao"];
        match.timeVisitante.placar = jogo.placar2 == null ?  "?" : jogo.placar2;
        match.data = jogo.data;
        match.horario = jogo.horario;
        match.local = jogo.local;
        match.estadio = jogo.estadio;
        match.probabilidade = {};
        match.probabilidade.timeCasaVitoria = percent(probs.result.home);
        match.probabilidade.timeVisitanteVitoria = percent(probs.result.away);
        match.probabilidade.empate = percent(probs.result.draw);
             
        matchs.push(match);
        
    }
    
    return matchs;
}


function percent (percent) {
    return (percent * 100).toFixed(1) + '%'
}


// Aplicação disponível em http://127.0.0.1:8888/
app.listen(8888);
