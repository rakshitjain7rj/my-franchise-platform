import React from 'react'
import Contactinfo from "./ContactInfo";
import DeliveryDetails from "./DeliveryDetails";
import PaymentMethod from "./PaymentMethod";
import { Card, CardContent } from "@/components/ui/card";





function CheckOutForm() {
    return (
        <div>
            <Card className="py-0">
                <CardContent className='p-0' >
                    <Contactinfo />
                    <DeliveryDetails />
                    <PaymentMethod />
                </CardContent>
            </Card>
        </div>
    )
}

export default CheckOutForm