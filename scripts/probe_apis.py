"""Print one raw response from each quote API, to diagnose collector failures."""

import json

import requests

from assayer.collect import quotes

NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"
NVDAON_ETH = "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee"
NVDAON_BSC = "0xa9ee28c80f960b889dfbd1902055218cba016f75"


def show(label, response):
    print(f"\n=== {label}: HTTP {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=1)[:1500])
    except ValueError:
        print(response.text[:800])


s = requests.Session()
show("solana decimals", s.post(quotes.SOLANA_RPC, json={
    "jsonrpc": "2.0", "id": 1, "method": "getTokenSupply", "params": [NVDAX]}, timeout=20))
show("jupiter quote USDC->NVDAx", s.get(quotes.JUPITER_QUOTE, params={
    "inputMint": quotes.STABLES["solana"].address, "outputMint": NVDAX,
    "amount": 1_000_000_000, "slippageBps": 50}, timeout=20))
for chain, token in (("ethereum", NVDAON_ETH), ("bsc", NVDAON_BSC)):
    stable = quotes.STABLES[chain]
    show(f"kyber {chain}", s.get(quotes.KYBER_ROUTES.format(chain=chain), params={
        "tokenIn": stable.address, "tokenOut": token,
        "amountIn": quotes.to_units(1000, stable.decimals)},
        headers={"x-client-id": "assayer"}, timeout=20))
    show(f"rpc decimals {chain}", s.post(quotes.EVM_RPC[chain], json={
        "jsonrpc": "2.0", "id": 1, "method": "eth_call",
        "params": [{"to": token, "data": "0x313ce567"}, "latest"]}, timeout=20))
