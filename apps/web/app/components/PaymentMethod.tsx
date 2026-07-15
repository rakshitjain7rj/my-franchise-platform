"use client";

import React, { useState } from 'react'
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { CreditCard } from "lucide-react"





function PaymentMethod() {
    const [paymentMethod, setPaymentMethod] = useState("card")
    return (
        <div>
            <Card className='rounded-none bg-white'>
                <CardContent className='space-y-4' >


                    <div className="w-full bg-white  ">

                        {/* Header Section */}
                        <div className="flex items-center space-x-2 mb-6">

                            <CreditCard className="w-8 h-8 text-[#4A154B]" />
                            <div>
                                <h2 className="text-2xl  text-[#4A154B] tracking-tight">Payment Method</h2>
                                <p className="text-xs text-slate-500">Securely encrypted payment processing.</p>
                            </div>
                        </div>
                        {/* Radio Group System */}
                        <RadioGroup
                            value={paymentMethod}
                            onValueChange={setPaymentMethod}
                            className="space-y-4"
                        >

                            {/* CREDIT / DEBIT CARD PANEL  */}
                            <div className="border border-slate-200 rounded-xl p-5 transition-all duration-200 has-[:checked]:border-[#4A154B] has-[:checked]:ring-1 has-[:checked]:ring-[#4A154B]">

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        {/* Modified RadioGroupItem below to create the white-center donut effect */}
                                        <RadioGroupItem
                                            value="card"
                                            id="credit-card"
                                            className="w-5 h-5 rounded-full border border-slate-400 bg-white transition-all 
                               data-[state=checked]:border-[#4A154B] 
                               data-[state=checked]:border-[5px] 
                               data-[state=checked]:bg-white 
                               focus:ring-[#4A154B] 
                               [&_span]:hidden"
                                        />
                                        <Label htmlFor="credit-card" className="font-semibold text-slate-700 text-sm cursor-pointer select-none">
                                            Credit / Debit Card
                                        </Label>
                                    </div>

                                    {/* Card Brand Sub-Badges */}
                                    <div className="flex space-x-1">
                                        <span className="text-[10px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50 uppercase tracking-wider">Visa</span>
                                        <span className="text-[10px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50 uppercase tracking-wider">MC</span>
                                    </div>
                                </div>

                                {/* Collapsible Inner Card Fields (Shown only when 'card' is selected) */}
                                {paymentMethod === "card" && (
                                    <div className="mt-5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div>
                                            <Input
                                                type="text"
                                                placeholder="Card number"
                                                className="h-11 border-slate-200 focus-visible:ring-[#4A154B]"
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                type="text"
                                                placeholder="Name on card"
                                                className="h-11 border-slate-200 focus-visible:ring-[#4A154B]"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Input
                                                type="text"
                                                placeholder="Exp (MM / YY)"
                                                className="h-11 border-slate-200 focus-visible:ring-[#4A154B]"
                                            />
                                            <Input
                                                type="password"
                                                placeholder="CVV"
                                                maxLength={4}
                                                className="h-11 border-slate-200 focus-visible:ring-[#4A154B]"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* --- OPTION 2: PAYPAL PANEL --- */}
                            <div className="border border-slate-200 rounded-xl p-5 transition-all duration-200 has-[:checked]:border-[#4A154B] has-[:checked]:ring-1 has-[:checked]:ring-[#4A154B]">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        {/* Modified RadioGroupItem below to create the white-center donut effect */}
                                        <RadioGroupItem
                                            value="paypal"
                                            id="paypal"
                                            className="w-5 h-5 rounded-full border border-slate-400 bg-white transition-all 
                               data-[state=checked]:border-[#4A154B] 
                               data-[state=checked]:border-[5px] 
                               data-[state=checked]:bg-white 
                               focus:ring-[#4A154B] 
                               [&_span]:hidden"
                                        />
                                        <Label htmlFor="paypal" className="font-semibold text-slate-700 text-sm cursor-pointer select-none">
                                            PayPal
                                        </Label>
                                    </div>

                                    {/* PayPal Stylized Visual Badge */}
                                    <span className="text-[11px] font-black italic text-white bg-[#003087] px-2 py-0.5 rounded tracking-tight">
                                        Paypal
                                    </span>
                                </div>
                            </div>

                        </RadioGroup>

                    </div>


                </CardContent>
            </Card>
        </div >
    )
}

export default PaymentMethod